import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config } from './config.js';
// Import visualization modules
import * as Bars from './visualizations/bars.js';
import * as Sphere from './visualizations/sphere.js';
import * as Terrain from './visualizations/terrain.js';
import * as Galaxy from './visualizations/galaxy.js';

// Main variables
let scene, camera, renderer, analyser, dataArray;
let audioContext, mediaStreamSource;
let activeVisualization = null; // This will now hold the group/object returned by the create function
let activeVisualizationModule = null; // This will hold the imported module (Bars, Sphere, etc.) or the dynamic AI module
let controls, visualizationType = 'bars';
let lastUserSelectedVizType = 'bars'; // Keep track of user's choice before AI takes over

// AI related variables
let isAiModeActive = false;
let aiIntervalId = null;
const AI_GENERATION_INTERVAL = 90000; // 90 seconds
let currentAiModule = null;
let currentAiModuleUrl = null; // Store the blob URL for cleanup

// DOM elements
const startButton = document.getElementById('startButton');
const statusElement = document.getElementById('status');
const sensitivitySlider = document.getElementById('sensitivity');
const smoothingSlider = document.getElementById('smoothing');
const visualizationTypeSelector = document.getElementById('visualizationType');
const aiToggle = document.getElementById('aiToggle'); // The AI toggle checkbox
const aiStatusElement = document.getElementById('aiStatus'); // For AI status messages

// Initialize the scene
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Camera setup
    camera = new THREE.PerspectiveCamera(
        config.camera.fov,
        window.innerWidth / window.innerHeight,
        config.camera.near,
        config.camera.far
    );
    camera.position.set(
        config.camera.initialPosition.x,
        config.camera.initialPosition.y,
        config.camera.initialPosition.z
    );

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('visualizer-container').appendChild(renderer.domElement);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Add point light for more dynamic lighting
    const pointLight = new THREE.PointLight(0xffffff, 1.5, 500);
    pointLight.position.set(50, 100, 150);
    scene.add(pointLight);

    // Add controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = config.camera.autoRotateSpeed;
    controls.listenToKeyEvents(window);

    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Audio capture and analysis setup
async function setupAudioCapture() {
    try {
        // Request user to select a tab to capture
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true, // Need video temporarily to get audio permissions sometimes
            audio: true,
            preferCurrentTab: false,
            selfBrowserSurface: "exclude",
            systemAudio: "include"
        });

        // Check if audio track exists
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
             // Stop the dummy video track if one exists
            stream.getVideoTracks().forEach(track => track.stop());
            throw new Error('No audio track found. Share a tab/window with audio.');
        }

        // Stop video tracks as we only need audio
        stream.getVideoTracks().forEach(track => track.stop());

        statusElement.textContent = 'Audio capture started';
        startButton.textContent = 'Change Tab Source';

        // Close existing audio context if present
        if (audioContext) {
            await audioContext.close();
        }

        // Create audio context and analyzer
        audioContext = new AudioContext();
        mediaStreamSource = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();

        analyser.fftSize = config.audio.fftSize;
        analyser.minDecibels = config.audio.minDecibels;
        analyser.maxDecibels = config.audio.maxDecibels;
        analyser.smoothingTimeConstant = parseFloat(smoothingSlider.value);

        mediaStreamSource.connect(analyser);

        // Create data array for frequency analysis
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Create the currently selected visualization (or AI if active)
        const typeToCreate = isAiModeActive ? 'ai' : visualizationType;
        await createVisualization(typeToCreate);

        // Start animation loop if not already running
        if (!renderer) return;
        if (renderer.info.render.frame === 0) {
            animate();
        }

        // Handle stream ending (user stops sharing)
        stream.getAudioTracks()[0].onended = () => {
            statusElement.textContent = 'Audio capture stopped';
            startButton.textContent = 'Start Visualizer';
            stopAiMode(); // Turn off AI mode if stream stops
            aiToggle.checked = false;
            aiStatusElement.textContent = '';
            if (activeVisualization) {
                scene.remove(activeVisualization);
                activeVisualization = null;
                activeVisualizationModule = null;
            }
            // Clean up audio resources
            if (mediaStreamSource) mediaStreamSource.disconnect();
            if (audioContext) audioContext.close().catch(e => console.error("Error closing audio context:", e));
            analyser = null;
            audioContext = null;
            mediaStreamSource = null;
            dataArray = null;
        };

    } catch (error) {
        console.error('Error capturing audio:', error);
        statusElement.textContent = 'Error: ' + error.message;
        startButton.textContent = 'Try Again';
        stopAiMode(); // Ensure AI mode is off if setup fails
        aiToggle.checked = false;
        aiStatusElement.textContent = '';
    }
}

// Create the selected visualization by calling the appropriate module
async function createVisualization(type) {
    // Remove existing visualization if any
    if (activeVisualization) {
        scene.remove(activeVisualization);
        // Maybe call a cleanup function if the module provided one? (Future enhancement)
        activeVisualization = null;
        activeVisualizationModule = null;
    }

    statusElement.textContent = `Loading ${type === 'ai' ? 'AI' : type}...`;

    // Select the correct module based on type
    try {
        switch (type) {
            case 'bars':
                activeVisualizationModule = Bars;
                break;
            case 'sphere':
                activeVisualizationModule = Sphere;
                break;
            case 'terrain':
                activeVisualizationModule = Terrain;
                break;
            case 'galaxy':
                activeVisualizationModule = Galaxy;
                break;
            case 'ai':
                if (currentAiModule) {
                    activeVisualizationModule = currentAiModule;
                     // Ensure config namespace exists, default if not
                    config.aiGeneratedViz = config.aiGeneratedViz || {};
                } else {
                    // AI module not loaded yet, maybe generate first?
                    console.warn("Attempted to create AI visualization before module was loaded.");
                    // Fallback to user's last selected type or default
                    await createVisualization(lastUserSelectedVizType);
                    return; // Exit early
                }
                break;
            default:
                console.warn(`Unknown visualization type: ${type}. Defaulting to '${lastUserSelectedVizType}'.`);
                await createVisualization(lastUserSelectedVizType);
                return; // Exit early
        }

        // Call the create function from the selected module
        if (activeVisualizationModule && typeof activeVisualizationModule.createVisualization === 'function') {
            activeVisualization = activeVisualizationModule.createVisualization(scene, config);
            if (activeVisualization instanceof THREE.Object3D) { // Check if it returned a valid object
                scene.add(activeVisualization);
                statusElement.textContent = `Visualizer: ${type === 'ai' ? 'AI Generated' : type}`;
                visualizationType = type; // Update the active type
            } else {
                 throw new Error(`Create function for ${type} did not return a valid THREE.Object3D.`);
            }
        } else {
             throw new Error(`Module for ${type} does not have a valid createVisualization function.`);
        }
    } catch (error) {
        console.error(`Error creating visualization '${type}':`, error);
        statusElement.textContent = `Error creating ${type}.`;
        // Attempt to fallback safely
        activeVisualization = null;
        activeVisualizationModule = null;
        if (type !== lastUserSelectedVizType) { // Avoid infinite loop if default fails
             console.log(`Falling back to visualizer: ${lastUserSelectedVizType}`);
             await createVisualization(lastUserSelectedVizType);
        } else {
            console.error("Fallback visualizer also failed.");
             statusElement.textContent = `Error creating ${type}. Cannot load fallback.`;
        }
    }
}

// Update visualizations based on audio data
function updateVisualization() {
    if (!analyser || !activeVisualization || !activeVisualizationModule || !dataArray) return;

    analyser.getByteFrequencyData(dataArray);
    const sensitivity = parseFloat(sensitivitySlider.value);

    if (typeof activeVisualizationModule.updateVisualization === 'function') {
        try {
             // Ensure config namespace for AI viz exists if needed
             if (visualizationType === 'ai') {
                config.aiGeneratedViz = config.aiGeneratedViz || {};
             }
            activeVisualizationModule.updateVisualization(activeVisualization, dataArray, analyser, sensitivity, config);
        } catch (error) {
            console.error(`Error updating visualization '${visualizationType}':`, error);
            statusElement.textContent = `Error updating ${visualizationType}. Stopping updates for this viz.`;
            // Disable updates for this broken viz
            activeVisualizationModule = null;
            // Optionally, try to switch to a default viz?
             if (isAiModeActive) {
                 aiStatusElement.textContent = `Error in AI viz. Generating new one...`;
                 // Immediately try generating a new one instead of waiting
                 if (aiIntervalId) clearInterval(aiIntervalId); // Stop old timer
                 aiIntervalId = setTimeout(generateAndSwitchAiVisualizer, 500); // Retry quickly
             } else {
                // If not AI mode, maybe switch back to default non-AI
                if (visualizationType !== lastUserSelectedVizType) {
                    createVisualization(lastUserSelectedVizType);
                }
             }
        }
    }
}

// --- AI Generation Logic ---

const VISUALIZATION_IDEAS = `
- **Bars:** Arrange objects (like cubes, cylinders) in a circle/grid. Height/color/scale responds to frequencies. Maybe add rotation or core pulse.
- **Sphere:** Distort Icosahedron/Sphere vertices based on frequencies. Use PBR materials (metalness, roughness, emissive). Add orbiting elements (rings, particles).
- **Terrain:** PlaneGeometry vertex Y positions modified by frequency map. Use vertex colors. Add fog, reflection, or particle layers. Animate with waves.
- **Galaxy/Nebula:** Thousands of Points (BufferGeometry). Spiral/cloud shapes. Use AdditiveBlending. Animate position/color based on audio averages (bass, mid, high).
- **Particles:** Points in a volume (sphere, box) or following paths. Animate position/size/color via audio. Add velocity for physics-like movement.
- **Geometry Mod:** Scale/rotate/morph a base shape (Torus, Box, Custom) based on audio.
- **Material Focus:** Less geometry change, more focus on material properties reacting: emissive intensity, color shifts (HSL), roughness/metalness changes, opacity fades.
- **Combining:** A central reactive element + background particle field; terrain with objects moving on it reacting to audio.
`;

const AI_SYSTEM_PROMPT = `
You are an expert Three.js developer creating audio visualizer modules dynamically.
Generate JavaScript code for a *new*, *creative* audio visualizer module using ES6 module syntax.

**Framework Context:**
- You are generating the *content* of an ES module.
- It will be loaded dynamically using \`import()\`.
- \`import * as THREE from 'three';\` is implicitly available at the top level scope where this module will run, *do not* include this import line in your generated code.
- Your code needs to export two functions: \`createVisualization(scene, config)\` and \`updateVisualization(group, dataArray, analyser, sensitivity, config)\`.
- The \`createVisualization\` function *must* return a \`THREE.Group()\` instance containing all visualization objects.
- The \`updateVisualization\` function modifies objects within the passed \`group\`.
- Use \`config.aiGeneratedViz\` to access specific configuration values. You *must* invent reasonable default values within your code or assume they exist in \`config.aiGeneratedViz\` (e.g., \`const particleCount = config.aiGeneratedViz?.particleCount || 5000;\`). Provide sensible defaults.
- Access audio data via \`dataArray\` (Uint8Array, length=\`analyser.frequencyBinCount\`). Calculate averages (\`bassAvg\`, \`midAvg\`, etc.) or use specific bins.
- Use the \`sensitivity\` float (0.5-5.0) to scale audio effects.
- Use \`Date.now()\` or a time uniform for animations independent of audio.
- Mark attributes for update (\`positions.needsUpdate = true\`, etc.).
- Be mindful of performance: Limit high counts of particles/vertices unless essential. Avoid very complex math in tight loops.

**Output:**
Respond *only* with the JavaScript code for the module's contents (starting directly with exports or internal functions/variables). Do not include markdown formatting, explanations, or the \`import * as THREE from 'three';\` line.

**Task:**
Generate a new, creative visualizer module now, drawing inspiration from these concepts if needed:
${VISUALIZATION_IDEAS}
Focus on visual appeal and responsiveness to audio dynamics. Ensure your code defines and exports the required functions correctly. Use \`config.aiGeneratedViz\` for parameters.
`;


async function generateAndSwitchAiVisualizer() {
    if (!analyser) {
        console.warn("Cannot generate AI visualizer without audio context.");
        aiStatusElement.textContent = "Start audio first.";
        stopAiMode();
        aiToggle.checked = false;
        return;
    }

    aiStatusElement.textContent = "Generating AI visualizer...";
    console.log("Generating new AI visualizer...");

    try {
        // Ensure config namespace exists
        config.aiGeneratedViz = config.aiGeneratedViz || {};

        const completion = await websim.chat.completions.create({
            messages: [
                { role: "system", content: AI_SYSTEM_PROMPT },
                { role: "user", content: "Generate a new visualizer module code." }
                 // No history needed for this use case
            ],
        });

        const generatedCode = completion.content.trim();
        // Basic check if it looks like code
        if (!generatedCode || !generatedCode.includes('export function createVisualization')) {
             throw new Error("LLM did not return valid-looking code.");
        }

        // Clean up old module URL if exists
        if (currentAiModuleUrl) {
            URL.revokeObjectURL(currentAiModuleUrl);
            currentAiModuleUrl = null;
            currentAiModule = null;
        }

        // Create Blob and URL for the new code
        // Prepending the THREE import since the LLM is asked not to include it.
        // This makes the dynamic import work correctly.
        const fullCode = `import * as THREE from 'three';\n${generatedCode}`;
        const blob = new Blob([fullCode], { type: 'application/javascript' });
        currentAiModuleUrl = URL.createObjectURL(blob);

        // Dynamically import the module
        currentAiModule = await import(currentAiModuleUrl);

        // Check if the imported module has the required functions
        if (typeof currentAiModule.createVisualization !== 'function' || typeof currentAiModule.updateVisualization !== 'function') {
            throw new Error("Imported AI module is missing required functions.");
        }

        console.log("AI module loaded successfully.");
        aiStatusElement.textContent = "Switching to new AI visualizer...";

        // Make the 'AI Generated' option selectable and select it
        const aiOption = visualizationTypeSelector.querySelector('option[value="ai"]');
        if (aiOption) aiOption.disabled = false;
        visualizationTypeSelector.value = 'ai';
        visualizationTypeSelector.disabled = true; // Disable selector while AI is active


        // Switch to the new visualization
        await createVisualization('ai');
        aiStatusElement.textContent = "AI Visualizer Active";


    } catch (error) {
        console.error('Error generating or switching AI visualization:', error);
        aiStatusElement.textContent = `AI Error: ${error.message.substring(0, 50)}...`;
        // Clean up potentially broken module URL
        if (currentAiModuleUrl) {
            URL.revokeObjectURL(currentAiModuleUrl);
            currentAiModuleUrl = null;
            currentAiModule = null;
        }
        // Optionally turn off AI mode on error, or just wait for next interval?
        // Let's keep it trying for now, maybe the next one works.
         aiStatusElement.textContent += " Retrying soon.";
    }
}

function startAiMode() {
    if (isAiModeActive) return;
    isAiModeActive = true;
    console.log("Starting AI Mode");

    // Store the currently selected user visualizer
    if (visualizationType !== 'ai') {
       lastUserSelectedVizType = visualizationType;
    }

    generateAndSwitchAiVisualizer(); // Generate the first one immediately
    // Schedule subsequent generations
    aiIntervalId = setInterval(generateAndSwitchAiVisualizer, AI_GENERATION_INTERVAL);

    visualizationTypeSelector.disabled = true; // Disable manual selection
    const aiOption = visualizationTypeSelector.querySelector('option[value="ai"]');
     if (aiOption) aiOption.disabled = false; // Ensure AI option is enabled
}

function stopAiMode() {
    if (!isAiModeActive) return;
    isAiModeActive = false;
    console.log("Stopping AI Mode");

    if (aiIntervalId) {
        clearInterval(aiIntervalId);
        aiIntervalId = null;
    }
    // Clean up the last loaded AI module
    if (currentAiModuleUrl) {
        URL.revokeObjectURL(currentAiModuleUrl);
        currentAiModuleUrl = null;
        currentAiModule = null;
    }

    visualizationTypeSelector.disabled = false; // Re-enable selector
    const aiOption = visualizationTypeSelector.querySelector('option[value="ai"]');
    if (aiOption) aiOption.disabled = true; // Disable AI option
    aiStatusElement.textContent = ""; // Clear AI status

    // Switch back to the user's last selected visualizer
    if (visualizationType === 'ai' && scene && analyser) {
         visualizationTypeSelector.value = lastUserSelectedVizType;
         createVisualization(lastUserSelectedVizType);
    } else if (visualizationType === 'ai' && !analyser) {
        // If audio stopped, just reset the type, don't create
        visualizationType = lastUserSelectedVizType;
        visualizationTypeSelector.value = lastUserSelectedVizType;
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    if (analyser && dataArray) {
        updateVisualization();
    }

    controls.update();
    renderer.render(scene, camera);
}

// Event listeners
startButton.addEventListener('click', setupAudioCapture);

smoothingSlider.addEventListener('input', (e) => {
    if (analyser) {
        analyser.smoothingTimeConstant = parseFloat(e.target.value);
    }
});

visualizationTypeSelector.addEventListener('change', async (e) => {
    const newType = e.target.value;
    // Only change if AI mode is not active and audio is running
    if (!isAiModeActive && newType !== 'ai' && scene && analyser && audioContext && audioContext.state === 'running') {
        lastUserSelectedVizType = newType; // Store user choice
        await createVisualization(newType);
    } else if (!isAiModeActive && newType !== 'ai') {
        // If audio isn't running, just store the type for later
        lastUserSelectedVizType = newType;
        visualizationType = newType;
    } else if (newType === 'ai' && !isAiModeActive) {
         // Prevent manual selection of disabled AI option
         e.target.value = lastUserSelectedVizType;
    }
});

aiToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        startAiMode();
    } else {
        stopAiMode();
    }
});


// Initialize everything
initScene();