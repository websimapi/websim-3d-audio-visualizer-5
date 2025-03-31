export const config = {
    // Visualization settings
    bars: {
        count: 128,         // Number of bars
        spacing: 0.2,       // Spacing between bars (Note: used implicitly in radius calculation)
        initialHeight: 0.1, // Initial height of bars
        maxHeight: 100,     // Maximum height bars can reach
        color1: 0x00ffff,   // Base color 1 (HSL hue used)
        color2: 0xff00ff,   // Base color 2 (HSL hue used)
        coreRadiusFactor: 0.3, // Radius of the central core relative to bar circle radius
        particleCount: 500,
        particleSize: 1.0, // Increased size slightly
        particleOpacity: 0.7,
        barMetalnessFactor: 0.7, // Max metalness based on audio
        barRoughnessFactor: 0.2,
        barOpacityFactor: 0.4
    },

    sphere: {
        radius: 50,          // Base radius of the sphere
        detail: 7,           // Detail level (Icosahedron subdivisions, max ~8)
        maxDistortion: 25,   // Increased max distortion
        color1: 0x00ff00,    // Core color (emissive base)
        color2: 0xff00ff,    // Outer color (main material color)
        metalness: 0.7,
        roughness: 0.3,
        clearcoat: 0.6,
        wireframeOpacity: 0.1, // Reduced opacity
        ringCount: 4,        // Added more rings
        ringSpacing: 0.25,   // Adjusted spacing
        ringBaseSpeed: 0.0015,
        particleCount: 1500, // More particles
        particleSize: 0.7,
        particleOpacity: 0.6,
        particleSpreadFactor: 2.5 // How far particles spread
    },

    terrain: {
        size: 120,           // Slightly larger terrain
        segments: 128,       // Detail level (ensure matches fftSize / 2 for direct mapping)
        amplitude: 20,       // Increased amplitude
        color1: 0x0055dd,    // Valley color (deeper blue)
        color2: 0xff5500,    // Peak color (more vibrant orange)
        metalness: 0.1,
        roughness: 0.9,      // Rougher terrain
        fogDensity: 0.01,    // Three.js Fog density (if using scene.fog)
        fogColor: 0x000000,
        reflectionOpacityFactor: 0.5, // Max opacity based on audio
        fogParticleCount: 800, // More fog particles
        fogParticleSize: 2.5,
        fogParticleOpacity: 0.3,
        waveSpeed: 0.0008,    // Speed of the visual wave pattern
        waveComplexity: 0.15  // Complexity factor for wave pattern
    },

    galaxy: { 
        particleCount: 50000, // Large number of particles
        armCount: 4,         // Number of spiral arms
        coreRadius: 15,      // Radius of the central core area
        galaxyRadius: 150,   // Overall radius of the galaxy
        thickness: 5,        // Thickness of the galaxy disk
        spiralFactor: 3.0,   // How tightly the arms spiral
        coreColor: 0xffddaa, // Bright core color
        armColor1: 0x88ccff, // Color for inner parts of arms
        armColor2: 0xdd88ff, // Color for outer parts of arms
        particleSize: 0.8,
        corePulseFactor: 1.5, // How much the core size reacts to bass
        armSpinFactor: 0.05, // How much arm particles spin based on mids/highs
        rotationSpeed: 0.0002 // Base rotation speed of the galaxy
    },

    // Audio analysis settings
    audio: {
        fftSize: 256,       // FFT size (power of 2). Higher values give more frequency bins.
        minDecibels: -90,
        maxDecibels: -10,
        defaultSmoothing: 0.6 // Slightly increased default smoothing
    },

    // Camera settings
    camera: {
        fov: 75,
        near: 0.1,
        far: 2000, // Increased far plane for larger visualizations
        initialPosition: { x: 0, y: 80, z: 200 }, // Adjusted initial camera position
        autoRotateSpeed: 0.3 // Slightly slower auto-rotate
    }
};