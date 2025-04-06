// Register Capacitor plugins
window.addEventListener('DOMContentLoaded', () => {
  // Wait for Capacitor to be ready
  if (window.Capacitor) {
    try {
      console.log('Registering Capacitor plugins...');
      
      // Make sure Plugins exists
      if (!window.Capacitor.Plugins) {
        window.Capacitor.Plugins = {};
      }
      
      // Try to load Speech Recognition plugin from global scope if it's registered
      // by the native platform during capacitor sync
      if (typeof CapacitorCommunitySpeechRecognition !== 'undefined') {
        window.Capacitor.Plugins.SpeechRecognition = CapacitorCommunitySpeechRecognition;
        console.log('Successfully registered Speech Recognition plugin');
      } else {
        console.error('Speech Recognition plugin not found in global scope');
      }
    } catch (err) {
      console.error('Error registering Capacitor plugins:', err);
    }
  } else {
    console.warn('Capacitor not available');
  }
}); 