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

            // --- ADD DETAILED LOGGING ---
            console.log(`DEBUG: Raw base64Audio length: ${base64Audio.length}`);
            // Log the first ~100 and last ~50 characters to check for prefixes/suffixes/corruption
            if (base64Audio && base64Audio.length > 150) {
                console.log(`DEBUG: base64Audio START: ${base64Audio.substring(0, 100)}`);
                console.log(`DEBUG: base64Audio END: ${base64Audio.substring(base64Audio.length - 50)}`);
            } else {
                console.log(`DEBUG: base64Audio (short): ${base64Audio}`);
            }
            // Check specifically for data URI prefix
            if (base64Audio && base64Audio.startsWith('data:')) {
                console.warn("DEBUG: base64Audio seems to have a data URI prefix! Attempting to strip it.");
                // Potential Fix 1: Strip the prefix before sending
                base64Audio = base64Audio.substring(base64Audio.indexOf(',') + 1); 
                console.log(`DEBUG: Stripped base64Audio START: ${base64Audio.substring(0, 100)}`);
            }
            // --- END DETAILED LOGGING ---

            // --- ADD THIS LOG ---
            console.log(`DEBUG: processAudioForTranscription - base64Audio length: ${base64Audio.length} characters.`);
            // Approximate MB size (Base64 is ~33% larger than binary)
            const approxSizeMB = (base64Audio.length * 6) / 8 / 1024 / 1024; 
            console.log(`DEBUG: processAudioForTranscription - Approximate binary size: ${approxSizeMB.toFixed(2)} MB`);
            // --- END ADDED LOG ---

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
        let retryCount = 0; // Define retryCount here
        const maxRetries = 2; // Define maxRetries here
        
        while (retryCount <= maxRetries) {
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
                        useEnhanced: false,
                    },
                    audio: {
                        content: base64Audio
                    }
                };
                
                // Define options needed for the request AND logging
                const options = {
                    url: `${GOOGLE_SPEECH_API_URL}?key=${GOOGLE_API_KEY}`,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(requestData)
                };

                // --- TEMPORARY DEBUGGING --- 
                const finalUrlForSpeechAPI = options.url; // Use url from options
                console.log(`DEBUG: sendAudioToGoogleSpeech - Attempting API call (${retryCount + 1}/${maxRetries + 1}) to URL: ${finalUrlForSpeechAPI}`); 
                
                if (!GOOGLE_API_KEY || GOOGLE_API_KEY.length < 20) {
                    console.error("DEBUG: sendAudioToGoogleSpeech - API Key seems MISSING or too short just before call!");
                }
                
                const requestOptionsForLogging = {
                    method: 'POST',
                    url: finalUrlForSpeechAPI, 
                    headers: options.headers,  
                    dataLength: options.data ? options.data.length : 0, 
                    connectTimeout: 60 + (retryCount * 30), 
                    readTimeout: 60 + (retryCount * 30)
                };
                console.log("DEBUG: sendAudioToGoogleSpeech - CapacitorHttp request options being sent:", JSON.stringify(requestOptionsForLogging, null, 2)); 
                // --- END TEMPORARY DEBUGGING --- 
    
                // Make the actual API request call using CapacitorHttp
                console.log("DEBUG: Attempting API call using CapacitorHttp plugin...");
                const response = await window.Capacitor.Plugins.CapacitorHttp.request({ 
                    method: 'POST',
                    ...options, // Spread the defined options (url, headers, data)
                    connectTimeout: 60 + (retryCount * 30), 
                    readTimeout: 60 + (retryCount * 30)
                }); 
                
                console.log(`DEBUG: CapacitorHttp response status: ${response.status}`);
                
                // Parse the response (Success Case)
                if (response.status === 200) {
                    const data = JSON.parse(response.data);
                    if (data && data.results && data.results.length > 0) {
                        const transcript = data.results
                            .map(result => result.alternatives[0].transcript)
                            .join(' ');
                        console.log('Received transcription (CapacitorHttp):', transcript.substring(0, 50) + '...');
                        return transcript; // Return success, exit loop
                    } else {
                        console.warn('No transcription results in API response (CapacitorHttp)');
                        return ''; // Return success (empty), exit loop
                    }
                } else {
                    // Handle non-200 status codes from API
                    console.error('Google Speech API error response (CapacitorHttp):', response);
                    throw new Error(`Google Speech API error (CapacitorHttp): ${response.status} - ${JSON.stringify(response.data)}`);
                }
                
            } catch (err) {
                // --- TEMPORARY DEBUGGING --- 
                console.error(`DEBUG: sendAudioToGoogleSpeech - Attempt ${retryCount + 1} FAILED (using CapacitorHttp). Full error object:`, JSON.stringify(err, Object.getOwnPropertyNames(err)));
                // --- END TEMPORARY DEBUGGING --- 
    
                // Log standard error message
                console.error(`Attempt ${retryCount + 1} failed (CapacitorHttp):`, err);
                
                // Check if it's a timeout and if retries are left
                if (retryCount < maxRetries && 
                    (err.message?.includes('timeout') || 
                     err.message?.includes('timed out') || 
                     err.code === "SocketTimeoutException")) {
                    
                    retryCount++;
                    console.log(`Retrying request (${retryCount}/${maxRetries}) (using CapacitorHttp)...`);
                    await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5s before retry
                    continue; // Go to the next iteration of the while loop
                }
                
                // If it's not a retryable error or retries exhausted, handle API key issue or re-throw
                if (err.message?.includes('API key')) {
                    throw new Error('Invalid or missing API key detected.');
                }
                // For any other error, re-throw to be caught by the calling function
                throw err; 
            }
        } // End while loop
        
        // If the loop finishes without returning or throwing a specific error, it means max retries were exceeded
        throw new Error("Max retries exceeded for Google Speech API call after " + (maxRetries + 1) + " attempts.");
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
    
    // --- TEMPORARY DEBUGGING - ADD THIS FUNCTION AND LISTENER ---
    async function runGoogleApiConnectionTest() {
        console.log("DEBUG: testGoogleAPI - Running API connection test...");
        processingStatus.textContent = "Running API test...";
        processingStatus.classList.remove('hidden');
        hideErrorMessage(); // Clear previous errors

        if (!window.GOOGLE_API_KEY || window.GOOGLE_API_KEY.length < 20) {
             const msg = 'DEBUG: testGoogleAPI - API Key seems missing or invalid in api-config.js';
             console.error(msg);
             alert(msg);
             processingStatus.classList.add('hidden');
             return;
        }
        
        try {
            // Use a simple read operation (like listing voices) which requires the key
            const testUrl = `https://texttospeech.googleapis.com/v1/voices?key=${window.GOOGLE_API_KEY}`; 
            console.log("DEBUG: testGoogleAPI - Test URL:", testUrl); 
            
            const response = await window.Capacitor.Plugins.CapacitorHttp.request({
                method: 'GET',
                url: testUrl,
                headers: { 'Accept': 'application/json' }, // Added Accept header
                connectTimeout: 20000, // 20 seconds
                readTimeout: 20000
            });
            
            console.log('DEBUG: testGoogleAPI - Raw Response:', response);
            const msg = `API connection test SUCCEEDED! Status: ${response.status}. Check console.`;
            console.log(msg);
            // alert(msg); // Alert might be annoying, use UI message
            showErrorMessage(msg); 
        } catch (err) {
            console.error('DEBUG: testGoogleAPI - Test FAILED. Full Error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
            const errorMsg = err.message || 'Unknown error';
            let detailedError = `API test FAILED: ${errorMsg}. Check console logs.`;
            try {
                // Try to get more specific error details if available
                 if (err.code) detailedError += ` (Code: ${err.code})`;
                 if (err.status) detailedError += ` (Status: ${err.status})`;
            } catch(e) {/*ignore*/}

            alert(detailedError); // Use alert for definite failure notice
            showErrorMessage(detailedError); 
        } finally {
            processingStatus.classList.add('hidden');
        }
    }
    
    // Find the button and add listener after DOM is loaded
    const testButton = document.getElementById('testApiButton');
    if (testButton) {
        testButton.addEventListener('click', runGoogleApiConnectionTest);
        console.log("DEBUG: Added listener to Test API button.");
    } else {
        console.error("DEBUG: Test API button not found!");
    }
    window.runGoogleApiConnectionTest = runGoogleApiConnectionTest; // Make accessible globally if needed
    // --- END TEMPORARY DEBUGGING ---
}); 