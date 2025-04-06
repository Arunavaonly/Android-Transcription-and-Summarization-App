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
    let audioRecorder = null;
    let audioChunks = [];
    let transcriptText = '';
    let capacitorAvailable = false;
    let recordingInterval = null;
    let recordingStartTime = null;

    // Initialize Capacitor plugins
    async function initCapacitor() {
        try {
            if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                capacitorAvailable = true;
                console.log('Capacitor is available on native platform');
                
                // Check if HTTP plugin is available
                if (window.Capacitor.Plugins && window.Capacitor.Plugins.Http) {
                    console.log('HTTP plugin found');
                    
                    // Setup audio recorder once HTTP plugin is confirmed
                    setupAudioRecorder();
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
    
    // Setup the audio recorder
    function setupAudioRecorder() {
        try {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    const audioContext = new AudioContext();
                    const audioStreamSource = audioContext.createMediaStreamSource(stream);
                    
                    // Create media recorder
                    audioRecorder = new MediaRecorder(stream);
                    audioRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            audioChunks.push(event.data);
                        }
                    };
                    
                    // Handle recording stopped
                    audioRecorder.onstop = async () => {
                        // Process the audio chunks here
                        if (audioChunks.length > 0) {
                            await processAudioForTranscription();
                        }
                    };
                })
                .catch(err => {
                    console.error('Error accessing audio stream:', err);
                    showErrorMessage('Microphone access denied: ' + err.message);
                    permissionMessage.classList.remove('hidden');
                });
        } catch (err) {
            console.error('Error setting up audio recorder:', err);
            showErrorMessage('Could not set up audio recording: ' + err.message);
        }
    }
    
    // Process recorded audio and send for transcription
    async function processAudioForTranscription() {
        try {
            // Create blob from audio chunks
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // Convert to base64
            const base64Audio = await blobToBase64(audioBlob);
            
            // Send to Google Cloud Speech-to-Text API
            const transcription = await sendAudioToGoogleSpeech(base64Audio);
            
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
            audioChunks = [];
            processingStatus.classList.add('hidden');
        }
    }
    
    // Convert Blob to Base64
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    // Send audio to Google Cloud Speech-to-Text API
    async function sendAudioToGoogleSpeech(base64Audio) {
        try {
            // Prepare the request payload
            const requestData = {
                config: {
                    encoding: 'WEBM_OPUS',
                    sampleRateHertz: 48000,
                    languageCode: 'en-US',
                    model: 'default',
                    enableAutomaticPunctuation: true,
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
            
            const response = await window.Capacitor.Plugins.Http.request({
                method: 'POST',
                ...options
            });
            
            // Parse the response
            if (response.status === 200) {
                const data = JSON.parse(response.data);
                if (data && data.results && data.results.length > 0) {
                    // Combine all transcriptions
                    return data.results
                        .map(result => result.alternatives[0].transcript)
                        .join(' ');
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
        
        if (!audioRecorder) {
            showErrorMessage('Audio recorder not initialized properly.');
            return;
        }
        
        if (recordButton.hasAttribute('data-processing')) return;
        recordButton.setAttribute('data-processing', '');
        
        if (isRecording) {
            await stopRecording();
        } else {
            await startRecording();
        }
        
        setTimeout(() => recordButton.removeAttribute('data-processing'), 300);
    }
    
    // Start recording
    async function startRecording() {
        // Clear any previous error messages
        hideErrorMessage();
        
        // Reset transcript and UI
        transcriptText = '';
        audioChunks = [];
        transcriptionResult.textContent = 'Listening...';
        summaryResult.textContent = 'Your summary will appear here';
        
        try {
            // Start recording
            audioRecorder.start(1000); // Collect data every second
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
            console.log('Stopping audio recording');
            audioRecorder.stop();
            console.log('Audio recording stopped, processing...');
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
            const response = await window.Capacitor.Plugins.Http.request({
                method: 'POST',
                url: SUMMARY_API_URL,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                data: JSON.stringify(requestData)
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