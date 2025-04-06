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
    let transcriptParts = [];  // Store individual transcript segments
    let restartCount = 0;      // Track restart attempts
  
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
                        if (permissionStatus && !permissionStatus.permission) {
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
                            // Reset restart counter on successful recognition
                            restartCount = 0;
                            
                            if (data?.matches?.length) {
                                const finalResult = data.matches[0];
                                addToTranscription(finalResult);
                                console.log(`Added text: "${finalResult}"`);
                            }
                            
                            // Restart immediately for continuous listening
                            if (isRecording) {
                                console.log('Recognition finished, restarting automatically');
                                startRecognitionAttempt();
                            }
                        });
                          
                        // Add error listener with better error handling
                        speechRecognitionPlugin.addListener('error', (error) => {
                            console.error('Speech recognition error:', error);
                            
                            // All "No match" errors are transient - just restart
                            if (isRecording) {
                                // Increment restart counter
                                restartCount++;
                                console.log(`Recognition error (attempt ${restartCount}): ${error.message}`);
                                
                                // Longer delay between restarts to help prevent rapid failures
                                const delayMs = Math.min(1000, 300 + (restartCount * 100));
                                
                                setTimeout(() => {
                                    if (isRecording) {
                                        console.log(`Restarting recognition after error (delay: ${delayMs}ms)`);
                                        startRecognitionAttempt();
                                    }
                                }, delayMs);
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
    
    // Start a single recognition attempt
    async function startRecognitionAttempt() {
        if (!isRecording) return;
        
        try {
            console.log('Starting recognition attempt');
            await speechRecognitionPlugin.start({
                language: 'en-US',
                partialResults: true,
                profanityFilter: false
            });
        } catch (err) {
            console.error('Error starting recognition attempt:', err);
            if (isRecording) {
                // If we fail to start, try again after a delay
                setTimeout(startRecognitionAttempt, 1000);
            }
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
        transcriptParts = [];
        restartCount = 0;
        transcriptionResult.textContent = 'Listening...';
        summaryResult.textContent = 'Your summary will appear here';
        
        try {
            // Check and request permissions if needed
            const permissionStatus = await speechRecognitionPlugin.hasPermission();
            console.log('Permission status:', permissionStatus);

            const hasPerm = permissionStatus?.permission === true;
            if (!hasPerm) {
                console.log('Requesting microphone permission...');
                permissionMessage.classList.remove('hidden');
                // On Android this returns void, so we don't inspect the return value
                await speechRecognitionPlugin.requestPermission();
                permissionMessage.classList.add('hidden');
        }

            
            // Start recording with the native plugin
            await speechRecognitionPlugin.start({
                language: 'en-US',
                partialResults: true,
                profanityFilter: false
            });
            
            // Update UI state
            isRecording = true;
            updateUIForRecording(true);
            permissionMessage.classList.add('hidden');
            
            // Start first recognition attempt
            await startRecognitionAttempt();
        } catch (err) {
            console.error('Start recording error:', err);
            isRecording = false;
            updateUIForRecording(false);
            
            // Don't show error if it's just a first-time permission request
            const errorIsJustPermissionRequest = err.message && (
                err.message.includes('permission') || 
                err.message.includes('Permission')
            );
            
            if (!errorIsJustPermissionRequest) {
                showErrorMessage('Could not start speech recognition: ' + err.message);
            }
        }
    }
    
    // Stop recording
    async function stopRecording() {
        if (!isRecording) return;
        
        isRecording = false;
        updateUIForRecording(false);
        
        try {
            console.log('Stopping speech recognition');
            await speechRecognitionPlugin.stop();
            console.log('Speech recognition stopped');
            
            // CRITICAL FIX: Always send whatever transcript we have to the API
            // Only check if we have any text at all
            if (transcriptText && transcriptText.trim().length > 0) {
                console.log(`Transcription complete (${transcriptText.length} chars): "${transcriptText}"`);
                processingStatus.classList.remove('hidden');
                sendTranscriptionForSummary(transcriptText);
            } else {
                console.warn('No transcription captured');
                showErrorMessage('No speech detected. Please try again and speak clearly.');
            }
        } catch (err) {
            console.error('Stop recording error:', err);
            
            // EVEN if stop fails, still try to send whatever transcription we have
            if (transcriptText && transcriptText.trim().length > 0) {
                console.log(`Sending transcription despite stop error: ${transcriptText}`);
                processingStatus.classList.remove('hidden');
                sendTranscriptionForSummary(transcriptText);
            } else {
                showErrorMessage('Error stopping recording: ' + err.message);
            }
        }
    }
    
    // Update transcription with interim results
    function updateTranscription(text) {
        transcriptionResult.textContent = transcriptText + ' ' + text;
        transcriptionResult.scrollTop = transcriptionResult.scrollHeight;
    }
    
    // Add final results to the transcript
    function addToTranscription(text) {
        if (text && text.trim()) {
            transcriptParts.push(text.trim());
            transcriptText = transcriptParts.join(' ');
            transcriptionResult.textContent = transcriptText;
            transcriptionResult.scrollTop = transcriptionResult.scrollHeight;
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
    
    // Send to backend & disable button while processing
    async function sendTranscriptionForSummary(text) {
        recordButton.disabled = true;
        processingStatus.classList.remove('hidden');
        
        console.log(`Sending text to API: ${text.substring(0, 50)}... (length: ${text.length})`);
        console.log(`API URL: ${API_URL}`);
        
        try {
            // Check if we have valid text to send
            if (!text || text.trim().length === 0) {
                throw new Error('Text empty');
            }
            
            const requestData = { text };
            console.log('Request payload:', requestData);
            
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestData),
                mode: 'cors'
            });
            
            console.log(`API response status: ${res.status}`);
            
            if (!res.ok) {
                let errorDetail = '';
                try {
                    const errorText = await res.text();
                    errorDetail = errorText;
                    console.error('API error response:', errorText);
                } catch (e) {
                    errorDetail = 'Unable to get error details';
                }
                
                if (res.status === 0 || res.status === 403) {
                    throw new Error('CORS error - API server may be blocking requests from this app');
                } else {
                    throw new Error(res.statusText || `Server error (${res.status}): ${errorDetail}`);
                }
            }
            
            let data;
            try {
                data = await res.json();
                console.log('API response data:', data);
            } catch (e) {
                console.error('Error parsing API response as JSON:', e);
                throw new Error('Invalid response from server (not JSON)');
            }
            
            if (data && data.summary) {
                summaryResult.textContent = data.summary;
            } else {
                summaryResult.textContent = 'No summary returned from API';
                console.error('No summary in API response', data);
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