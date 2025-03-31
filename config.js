export const config = {
    // Visualization settings
    bars: {
        count: 128,         // Number of bars
        spacing: 0.2,       // Spacing between bars
        initialHeight: 0.1, // Initial height of bars
        maxHeight: 100,     // Maximum height bars can reach
        color1: 0x00ffff,   // Color for lower frequencies
        color2: 0xff00ff    // Color for higher frequencies
    },
    
    sphere: {
        radius: 50,          // Base radius of the sphere
        segments: 64,        // Detail level of the sphere
        maxDistortion: 20,   // Maximum distortion from audio
        color1: 0x00ff00,    // Core color
        color2: 0xff00ff     // Outer color
    },
    
    terrain: {
        size: 100,           // Size of the terrain
        segments: 128,       // Detail level (must be same as FFT size)
        amplitude: 15,       // Maximum height of waves
        color1: 0x0077ff,    // Valley color
        color2: 0xff3300     // Peak color
    },
    
    // Audio analysis settings
    audio: {
        fftSize: 256,       // FFT size (must be power of 2)
        minDecibels: -90,
        maxDecibels: -10,
        defaultSmoothing: 0.5
    },
    
    // Camera settings
    camera: {
        fov: 75,
        near: 0.1,
        far: 1000,
        initialPosition: { x: 0, y: 50, z: 150 },
        autoRotateSpeed: 0.5
    }
};