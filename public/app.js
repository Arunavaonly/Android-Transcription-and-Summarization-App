document.addEventListener('DOMContentLoaded', async () => {
    // DOM elements
    const recordButton = document.getElementById('recordButton');
    const recordButtonText = recordButton.querySelector('span');
    const recordButtonIcon = recordButton.querySelector('i');
    const recordingStatus = document.getElementById('recordingStatus');
    const processingStatus = document.getElementById('processingStatus');
    const errorMessage = document.getElementById('errorMessage');
    const permissionMessage = document.getElementById('permissionMessage');
    const transcriptionResult = document.getElementById('transcriptionResult');
    const summaryResult = document.getElementById('summaryResult');
  
    // API endpoint for summarization
    const SUMMARY_API_URL = 'https://trans-and-sum-project.el.r.appspot.com/summarize';
    
    // Google Cloud Speech-to-Text API endpoint
    const GOOGLE_SPEECH_API_URL = 'https://speech.googleapis.com/v1/speech:recognize';
    // Read API key from environment or an injected configuration
    const GOOGLE_API_KEY = window.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY || ''; 
    
    // App state
    let isRecording = false;
    let transcriptText = '';
    let capacitorAvailable = false;
    let recordingInterval = null;
    let recordingStartTime = null;
    let voiceRecorderAvailable = false;

    // Get access to Voice Recorder plugin with fallbacks
    function getVoiceRecorderPlugin() {
        // Try different ways to access the plugin
        if (window.Capacitor && window.Capacitor.Plugins) {
            // Try standard Capacitor.Plugins.VoiceRecorder
            if (window.Capacitor.Plugins.VoiceRecorder) {
                console.log('Using VoiceRecorder from Capacitor.Plugins');
                return window.Capacitor.Plugins.VoiceRecorder;
            }
            
            // Try other potential names
            if (window.Capacitor.Plugins['VoiceRecorder']) {
                console.log('Using VoiceRecorder from Capacitor.Plugins["VoiceRecorder"]');
                return window.Capacitor.Plugins['VoiceRecorder'];
            }
            
            if (window.Capacitor.Plugins['capacitor-voice-recorder']) {
                console.log('Using VoiceRecorder from Capacitor.Plugins["capacitor-voice-recorder"]');
                return window.Capacitor.Plugins['capacitor-voice-recorder'];
            }
            
            // Try case variations
            const pluginKeys = Object.keys(window.Capacitor.Plugins);
            console.log('Available plugin keys:', pluginKeys);
            
            const voiceRecorderKey = pluginKeys.find(key => 
                key.toLowerCase().includes('voice') || 
                key.toLowerCase().includes('record')
            );
            
            if (voiceRecorderKey) {
                console.log(`Using VoiceRecorder from alternate key: ${voiceRecorderKey}`);
                return window.Capacitor.Plugins[voiceRecorderKey];
            }
        }
        
        // Try global
        if (typeof VoiceRecorder !== 'undefined') {
            console.log('Using VoiceRecorder from global scope');
            return VoiceRecorder;
        }
        
        // Check for other naming in global scope
        if (typeof capacitorVoiceRecorder !== 'undefined') {
            console.log('Using capacitorVoiceRecorder from global scope');
            return capacitorVoiceRecorder;
        }
        
        console.error('Voice Recorder plugin not found in any namespace');
        return null;
    }
    
    // Initialize Capacitor plugins
    async function initCapacitor() {
        try {
            if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                capacitorAvailable = true;
                console.log('Capacitor is available on native platform');
                
                // Log all available plugins for debugging
                console.log('Available Capacitor Plugins:', window.Capacitor.Plugins ? Object.keys(window.Capacitor.Plugins) : 'None');
                
                // Check for required plugins
                if (window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
                    console.log('HTTP plugin found');
                    
                    // Try to get Voice Recorder plugin with fallbacks
                    const voiceRecorderPlugin = getVoiceRecorderPlugin();
                    
                    if (voiceRecorderPlugin) {
                        voiceRecorderAvailable = true;
                        console.log('Voice Recorder plugin found');
                        
                        // Use global variable to store plugin reference
                        window.voiceRecorderPluginRef = voiceRecorderPlugin;
                        
                        // Check for permission
                        await checkMicrophonePermission();
                    } else {
                        console.error('Voice Recorder plugin not found in any namespace');
                        showErrorMessage('Voice Recorder plugin not found - required for audio recording');
                    }
                    
                    console.log('App initialization complete');
                } else {
                    console.error('HTTP plugin not found in Capacitor.Plugins');
                    showErrorMessage('HTTP plugin not found - required for API calls');
                }
            } else {
                console.warn('Capacitor is not available or not on native platform - you need to build an APK');
                showErrorMessage('Native features require app installation. This is a preview only.');
            }
        } catch (err) {
            console.error('Capacitor initialization error:', err);
            showErrorMessage('Error initializing app capabilities: ' + err.message);
        }
    }
    
    // Check and request microphone permission
    async function checkMicrophonePermission() {
        try {
            console.log('Checking microphone permission');
            
            // Use the global plugin reference
            const voiceRecorderPlugin = window.voiceRecorderPluginRef;
            
            if (!voiceRecorderPlugin) {
                throw new Error('Voice Recorder plugin not available');
            }
            
            const permResult = await voiceRecorderPlugin.hasAudioRecordingPermission();
            
            if (!permResult.value) {
                console.log('Requesting microphone permission');
                permissionMessage.classList.remove('hidden');
                
                const requestResult = await voiceRecorderPlugin.requestAudioRecordingPermission();
                if (!requestResult.value) {
                    console.error('Microphone permission denied');
                    showErrorMessage('Microphone access is required for recording.');
                    return false;
                }
                
                permissionMessage.classList.add('hidden');
            }
            
            console.log('Microphone permission granted');
            return true;
        } catch (err) {
            console.error('Error checking/requesting microphone permission:', err);
            showErrorMessage('Error accessing microphone: ' + err.message);
            return false;
        }
    }
    
    // Process recorded audio and send for transcription
    async function processAudioForTranscription(recordResult) {
        try {
            if (!recordResult || !recordResult.value || !recordResult.value.recordDataBase64) {
                throw new Error('No recording data available');
            }
            
            // Get the base64 audio data
            const base64Audio = recordResult.value.recordDataBase64;
            console.log('Received audio recording, size:', base64Audio.length);
            
            // Get the mime type
            const mimeType = recordResult.value.mimeType || 'audio/wav'; // Default to WAV if not provided
            console.log('Recording mime type:', mimeType);
            
            // Send to Google Cloud Speech-to-Text API
            const transcription = await sendAudioToGoogleSpeech(base64Audio, mimeType);
            
            // Update the UI with the transcription
            if (transcription && transcription.trim().length > 0) {
                transcriptText = transcription;
                transcriptionResult.textContent = transcriptText;
                // Send for summarization
                await sendTranscriptionForSummary(transcriptText);
            } else {
                showErrorMessage('No speech detected. Please try again and speak clearly.');
            }
        } catch (err) {
            console.error('Error processing audio:', err);
            showErrorMessage('Error transcribing audio: ' + err.message);
        } finally {
            // Reset recording state
            processingStatus.classList.add('hidden');
        }
    }
    
    // Send audio to Google Cloud Speech-to-Text API
    async function sendAudioToGoogleSpeech(base64Audio, mimeType) {
        try {
            // Determine encoding based on mimeType
            let encoding = 'LINEAR16'; // Default for native voice recorder
            let sampleRateHertz = 16000; // Default for most native recordings
            
            // Map MIME types to Google Speech API encodings
            if (mimeType) {
                const lowerMimeType = mimeType.toLowerCase();
                if (lowerMimeType.includes('wav')) {
                    encoding = 'LINEAR16';
                    sampleRateHertz = 16000;
                } else if (lowerMimeType.includes('mp4') || lowerMimeType.includes('mpeg')) {
                    encoding = 'MP3';
                    sampleRateHertz = 16000;
                } else if (lowerMimeType.includes('aac')) {
                    encoding = 'AMR';
                    sampleRateHertz = 8000;
                } else if (lowerMimeType.includes('webm') && lowerMimeType.includes('opus')) {
                    encoding = 'WEBM_OPUS';
                    sampleRateHertz = 48000;
                } else if (lowerMimeType.includes('ogg')) {
                    encoding = 'OGG_OPUS';
                    sampleRateHertz = 48000;
                }
            }
            
            console.log('Using encoding for Google Speech API:', encoding, 'with sample rate:', sampleRateHertz);
            
            // Prepare the request payload
            const requestData = {
                config: {
                    encoding: encoding,
                    sampleRateHertz: sampleRateHertz,
                    languageCode: 'en-US',
                    model: 'default',
                    enableAutomaticPunctuation: true,
                    useEnhanced: true, // Use enhanced model for better results
                },
                audio: {
                    content: base64Audio
                }
            };
            
            // Make the API request
            const options = {
                url: `${GOOGLE_SPEECH_API_URL}?key=${GOOGLE_API_KEY}`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(requestData)
            };
            
            // Add timeout for request
            console.log('Sending audio to Google Speech API...');
            const response = await window.Capacitor.Plugins.CapacitorHttp.request({
                method: 'POST',
                ...options,
                connectTimeout: 30, // 30 seconds timeout
                readTimeout: 30
            });
            
            // Parse the response
            if (response.status === 200) {
                const data = JSON.parse(response.data);
                if (data && data.results && data.results.length > 0) {
                    // Combine all transcriptions
                    const transcript = data.results
                        .map(result => result.alternatives[0].transcript)
                        .join(' ');
                    console.log('Received transcription:', transcript.substring(0, 50) + '...');
                    return transcript;
                } else {
                    console.warn('No transcription results in API response');
                    return '';
                }
            } else {
                console.error('Google Speech API error:', response.data);
                throw new Error(`Google Speech API error: ${response.status} - ${response.data}`);
            }
        } catch (err) {
            console.error('Error sending audio to Google Speech API:', err);
            // If the error is related to the API key or authentication
            if (err.message && err.message.includes('API key')) {
                throw new Error('Invalid or missing API key. Please check api-config.js file.');
            }
            throw err;
        }
    }
    
    // Initialize app
    await initCapacitor();
    
    // Bind click event after initialization
    recordButton.addEventListener('click', toggleRecording);
    
    // Toggle recording state
    async function toggleRecording() {
        if (!capacitorAvailable) {
            showErrorMessage('This is a preview only. Build and install the app for full functionality.');
            return;
        }
        
        if (!voiceRecorderAvailable) {
            showErrorMessage('Voice recorder plugin not available.');
            return;
        }
        
        if (recordButton.hasAttribute('data-processing')) return;
        recordButton.setAttribute('data-processing', '');
        
        try {
            if (isRecording) {
                await stopRecording();
            } else {
                // First check permission
                const hasPermission = await checkMicrophonePermission();
                if (!hasPermission) {
                    console.error('Permission check failed');
                    showErrorMessage('Microphone permission is required.');
                    recordButton.removeAttribute('data-processing');
                    return;
                }
                
                await startRecording();
            }
        } catch (err) {
            console.error('Toggle recording error:', err);
            showErrorMessage('Error toggling recording: ' + err.message);
        } finally {
            setTimeout(() => recordButton.removeAttribute('data-processing'), 300);
        }
    }
    
    // Start recording
    async function startRecording() {
        // Clear any previous error messages
        hideErrorMessage();
        
        // Reset transcript and UI
        transcriptText = '';
        transcriptionResult.textContent = 'Listening...';
        summaryResult.textContent = 'Your summary will appear here';
        
        try {
            // Use the global plugin reference
            const voiceRecorderPlugin = window.voiceRecorderPluginRef;
            
            if (!voiceRecorderPlugin) {
                throw new Error('Voice Recorder plugin not available');
            }
            
            // Start recording using the Voice Recorder plugin
            console.log('Starting voice recording...');
            await voiceRecorderPlugin.startRecording();
            recordingStartTime = Date.now();
            
            // Start recording indicator
            isRecording = true;
            updateUIForRecording(true);
            
            // Add a recording interval to show time
            recordingInterval = setInterval(() => {
                const elapsedSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);
                const minutes = Math.floor(elapsedSeconds / 60);
                const seconds = elapsedSeconds % 60;
                recordingStatus.textContent = `Recording... ${minutes}:${seconds.toString().padStart(2, '0')}`;
            }, 1000);
            
            console.log('Recording started successfully');
        } catch (err) {
            console.error('Start recording error:', err);
            isRecording = false;
            updateUIForRecording(false);
            showErrorMessage('Could not start recording: ' + err.message);
        }
    }
    
    // Stop recording
    async function stopRecording() {
        if (!isRecording) return;
        
        isRecording = false;
        updateUIForRecording(false);
        processingStatus.classList.remove('hidden');
        
        // Clear the recording interval
        if (recordingInterval) {
            clearInterval(recordingInterval);
            recordingInterval = null;
        }
        
        try {
            // Use the global plugin reference
            const voiceRecorderPlugin = window.voiceRecorderPluginRef;
            
            if (!voiceRecorderPlugin) {
                throw new Error('Voice Recorder plugin not available');
            }
            
            console.log('Stopping voice recording...');
            const recordResult = await voiceRecorderPlugin.stopRecording();
            console.log('Voice recording stopped');
            
            // Process the recording result
            await processAudioForTranscription(recordResult);
        } catch (err) {
            console.error('Stop recording error:', err);
            processingStatus.classList.add('hidden');
            showErrorMessage('Error stopping recording: ' + err.message);
        }
    }
    
    // UI toggle for recording state
    function updateUIForRecording(on) {
        if (on) {
            recordButton.classList.add('recording');
            recordButtonText.textContent = 'Stop Recording';
            recordButtonIcon.classList.replace('fa-microphone', 'fa-stop');
            recordingStatus.classList.remove('hidden');
        } else {
            recordButton.classList.remove('recording');
            recordButtonText.textContent = 'Start Recording';
            recordButtonIcon.classList.replace('fa-stop', 'fa-microphone');
            recordingStatus.classList.add('hidden');
        }
    }
    
    // Show error message in UI
    function showErrorMessage(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            hideErrorMessage();
        }, 5000);
    }
    
    // Hide error message
    function hideErrorMessage() {
        errorMessage.classList.add('hidden');
        errorMessage.textContent = '';
    }
    
    // Send transcription to backend for summarization
    async function sendTranscriptionForSummary(text) {
        recordButton.disabled = true;
        processingStatus.classList.remove('hidden');
        
        console.log(`Sending text to API: ${text.substring(0, 50)}... (length: ${text.length})`);
        console.log(`API URL: ${SUMMARY_API_URL}`);
        
        try {
            // Check if we have valid text to send
            if (!text || text.trim().length === 0) {
                throw new Error('Text empty');
            }
            
            const requestData = { text };
            
            // Make the API request using Capacitor HTTP plugin
            const response = await window.Capacitor.Plugins.CapacitorHttp.request({
                method: 'POST',
                url: SUMMARY_API_URL,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                data: JSON.stringify(requestData),
                connectTimeout: 30,
                readTimeout: 30
            });
            
            console.log(`API response status: ${response.status}`);
            
            if (response.status !== 200) {
                throw new Error(`Server error (${response.status}): ${response.data}`);
            }
            
            try {
                const data = JSON.parse(response.data);
                console.log('API response data:', data);
                
                if (data && data.summary) {
                    summaryResult.textContent = data.summary;
                } else {
                    summaryResult.textContent = 'No summary returned from API';
                    console.error('No summary in API response', data);
                }
            } catch (e) {
                console.error('Error parsing API response as JSON:', e);
                throw new Error('Invalid response from server (not JSON)');
            }
        } catch (err) {
            console.error('API call error:', err);
            summaryResult.innerHTML = `<div class="error">Error: ${err.message}</div>`;
            showErrorMessage(`Summary API error: ${err.message}`);
        } finally {
            processingStatus.classList.add('hidden');
            recordButton.disabled = false;
        }
    }
}); 