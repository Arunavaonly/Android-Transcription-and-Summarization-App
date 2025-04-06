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
  
    // API endpoint
    const API_URL = 'https://trans-and-sum-project.el.r.appspot.com/summarize';
  
    // App state
    let isRecording = false;
    let transcriptText = '';
    let capacitorAvailable = false;
    let speechRecognitionPlugin = null;
  
    // Initialize Capacitor if available
    async function initCapacitor() {
        try {
            if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                capacitorAvailable = true;
                console.log('Capacitor is available on native platform');
                
                // Use global plugin instead of dynamic import
                if (window.Capacitor.Plugins && window.Capacitor.Plugins.SpeechRecognition) {
                    speechRecognitionPlugin = window.Capacitor.Plugins.SpeechRecognition;
                    console.log('Speech Recognition plugin found');
                    
                    // Check for permissions
                    try {
                        const { available } = await speechRecognitionPlugin.available();
                        if (!available) {
                            showErrorMessage('Speech recognition is not available on this device');
                            recordButton.disabled = true;
                            return;
                        }
                        
                        // Check permission status
                        const permissionStatus = await speechRecognitionPlugin.hasPermission();
                        if (!permissionStatus.permission) {
                            permissionMessage.classList.remove('hidden');
                        }
                        
                        // Set up listeners for speech recognition
                        speechRecognitionPlugin.addListener('partialResults', (data) => {
                            if (data && data.matches && data.matches.length > 0) {
                                const latestResult = data.matches[0];
                                updateTranscription(latestResult);
                            }
                        });
                        
                        speechRecognitionPlugin.addListener('finalResults', (data) => {
                            if (data && data.matches && data.matches.length > 0) {
                                const finalResult = data.matches[0];
                                addToTranscription(finalResult);
                            }
                        });
                    } catch (err) {
                        console.error('Speech recognition init error:', err);
                        showErrorMessage('Could not initialize speech recognition');
                    }
                } else {
                    console.error('Speech Recognition plugin not found in Capacitor.Plugins');
                    showErrorMessage('Speech recognition plugin not found');
                }
            } else {
                console.warn('Capacitor is not available or not on native platform - you need to build an APK');
                showErrorMessage('Native speech recognition requires app installation. This is a preview only.');
            }
        } catch (err) {
            console.error('Capacitor initialization error:', err);
            showErrorMessage('Error initializing speech recognition: ' + err.message);
        }
    }
    
    // Initialize app
    await initCapacitor();
    
    // Only bind click event after initialization
    recordButton.addEventListener('click', toggleRecording);
    
    // Toggle recording state
    async function toggleRecording() {
        if (!capacitorAvailable) {
            showErrorMessage('This is a preview only. Build and install the app for full functionality.');
            return;
        }
        
        if (!speechRecognitionPlugin) {
            showErrorMessage('Speech recognition plugin not initialized properly.');
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
    
    // Start recording with native plugin
    async function startRecording() {
        // Clear any previous error messages
        hideErrorMessage();
        
        // Reset transcript and UI
        transcriptText = '';
        transcriptionResult.textContent = 'Listening...';
        summaryResult.textContent = 'Your summary will appear here';
        
        try {
            // Check and request permissions if needed
            const permissionStatus = await speechRecognitionPlugin.hasPermission();
            if (!permissionStatus.permission) {
                const requestResult = await speechRecognitionPlugin.requestPermission();
                if (!requestResult.permission) {
                    showErrorMessage('Microphone permission denied');
                    return;
                }
            }
            
            // Start recording with the native plugin
            await speechRecognitionPlugin.start({
                language: 'en-US',
                partialResults: true,
                popup: false
            });
            
            // Update UI state
            isRecording = true;
            updateUIForRecording(true);
            permissionMessage.classList.add('hidden');
        } catch (err) {
            console.error('Start recording error:', err);
            isRecording = false;
            updateUIForRecording(false);
            showErrorMessage('Could not start speech recognition: ' + err.message);
        }
    }
    
    // Stop recording
    async function stopRecording() {
        isRecording = false;
        updateUIForRecording(false);
        
        try {
            await speechRecognitionPlugin.stop();
            
            // If we have meaningful transcript, process it
            if (transcriptText.trim().length > 10) {
                processingStatus.classList.remove('hidden');
                sendTranscriptionForSummary(transcriptText);
            } else {
                showErrorMessage('Recording too short. Please try again.');
            }
        } catch (err) {
            console.error('Stop recording error:', err);
            showErrorMessage('Error stopping recording: ' + err.message);
        }
    }
    
    // Update transcription with interim results
    function updateTranscription(text) {
        transcriptionResult.textContent = transcriptText + ' ' + text;
        transcriptionResult.scrollTop = transcriptionResult.scrollHeight;
    }
    
    // Add final results to the transcript
    function addToTranscription(text) {
        transcriptText += ' ' + text;
        transcriptionResult.textContent = transcriptText;
        transcriptionResult.scrollTop = transcriptionResult.scrollHeight;
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
    
    // Send to backend & disable button while processing
    async function sendTranscriptionForSummary(text) {
        recordButton.disabled = true;
        processingStatus.classList.remove('hidden');
        
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                mode: 'cors',
                body: JSON.stringify({ text })
            });
            
            if (!res.ok) throw new Error(res.statusText || 'Server error');
            
            const { summary } = await res.json();
            summaryResult.textContent = summary || 'No summary generated';
        } catch (err) {
            console.error(err);
            summaryResult.innerHTML = `<div class="error">Error: ${err.message}</div>`;
        } finally {
            processingStatus.classList.add('hidden');
            recordButton.disabled = false;
        }
    }
}); 