import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config } from './config.js';
// Import visualization modules
import * as Bars from './visualizations/bars.js';
import * as Sphere from './visualizations/sphere.js';
import * as Terrain from './visualizations/terrain.js';
import * as Galaxy from './visualizations/galaxy.js'; // Import the new visualization

// Main variables
let scene, camera, renderer, analyser, dataArray;
let audioContext, mediaStreamSource;
let activeVisualization = null; // This will now hold the group/object returned by the create function
let activeVisualizationModule = null; // This will hold the imported module (Bars, Sphere, etc.)
let controls, visualizationType = 'bars';
let llmConversationHistory = []; // Keep track of conversation for context

// DOM elements
const startButton = document.getElementById('startButton');
const statusElement = document.getElementById('status');
const sensitivitySlider = document.getElementById('sensitivity');
const smoothingSlider = document.getElementById('smoothing');
const visualizationTypeSelector = document.getElementById('visualizationType');
const aiGenerateButton = document.getElementById('aiGenerateButton');
const aiModal = document.getElementById('aiModal');
const closeModalButton = document.getElementById('closeModalButton');
const aiGeneratedCodeTextarea = document.getElementById('aiGeneratedCode');
const aiLoadingIndicator = document.getElementById('aiLoadingIndicator');

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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Slightly brighter ambient light
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
    controls.listenToKeyEvents(window); // Allow keyboard controls

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
            video: true,
            audio: true,
            preferCurrentTab: false,
            selfBrowserSurface: "exclude",
            systemAudio: "include"
        });

        // Check if audio track exists
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            throw new Error('No audio track found. Please select a tab with audio.');
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
        analyser.smoothingTimeConstant = parseFloat(smoothingSlider.value); // Use current slider value

        mediaStreamSource.connect(analyser);

        // Create data array for frequency analysis
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Create the currently selected visualization
        await createVisualization(visualizationType); // Make async to handle potential module loading

        // Start animation loop if not already running
        if (!renderer) return;
        // Ensure animate is only called once
        if (renderer.info.render.frame === 0) {
            animate();
        }

        // Handle stream ending (user stops sharing)
        stream.getAudioTracks()[0].onended = () => {
            statusElement.textContent = 'Audio capture stopped';
            startButton.textContent = 'Start Visualizer';
            if (activeVisualization) {
                scene.remove(activeVisualization);
                activeVisualization = null;
                activeVisualizationModule = null;
            }
            // Optionally stop the animation loop or clear dataArray?
            // For now, let it continue rendering the scene without updates.
        };

    } catch (error) {
        console.error('Error capturing audio:', error);
        statusElement.textContent = 'Error: ' + error.message;
        startButton.textContent = 'Try Again';
    }
}

// Create the selected visualization by calling the appropriate module
async function createVisualization(type) {
    // Remove existing visualization if any
    if (activeVisualization) {
        scene.remove(activeVisualization);
        activeVisualization = null;
        activeVisualizationModule = null;
    }

    // Select the correct module based on type
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
        case 'galaxy': // Add the new case
            activeVisualizationModule = Galaxy;
            break;
        // NOTE: Add cases for dynamically generated visualizations here if
        // you choose to implement dynamic loading later.
        default:
            console.warn(`Unknown or unloaded visualization type: ${type}. Defaulting to 'bars'.`);
            activeVisualizationModule = Bars; // Default to bars
            visualizationType = 'bars';
            visualizationTypeSelector.value = 'bars';
            break;
    }

    // Call the create function from the selected module
    if (activeVisualizationModule && typeof activeVisualizationModule.createVisualization === 'function') {
        try {
            activeVisualization = activeVisualizationModule.createVisualization(scene, config);
            if (activeVisualization) {
                scene.add(activeVisualization);
            } else {
                console.error(`Create function for ${type} did not return an object.`);
            }
        } catch (error) {
            console.error(`Error creating visualization '${type}':`, error);
            statusElement.textContent = `Error creating ${type}. Try another?`;
            // Fallback to default if creation fails
            if (type !== 'bars') {
                await createVisualization('bars');
            }
        }
    } else {
        console.error(`Module for ${type} does not have a createVisualization function.`);
    }
}

// Update visualizations based on audio data by calling the active module's update function
function updateVisualization() {
    if (!analyser || !activeVisualization || !activeVisualizationModule || !dataArray) return;

    // Get audio data
    analyser.getByteFrequencyData(dataArray);

    // Get sensitivity value from slider
    const sensitivity = parseFloat(sensitivitySlider.value);

    // Call the update function from the active module
    if (typeof activeVisualizationModule.updateVisualization === 'function') {
        try {
            activeVisualizationModule.updateVisualization(activeVisualization, dataArray, analyser, sensitivity, config);
        } catch (error) {
            console.error(`Error updating visualization '${visualizationType}':`, error);
            // Stop trying to update this broken visualization to prevent console spam
            activeVisualizationModule = null;
            statusElement.textContent = `Error updating ${visualizationType}. Please select another.`;
        }
    }
}

// --- AI Generation ---

const VISUALIZATION_IDEAS = `
- **Bars:** Arrange objects (like cubes) in a circle. Their height, color, or thickness changes based on frequency data. Add a central pulsing core or surrounding particles.
- **Sphere:** Use a sphere geometry (like Icosahedron). Distort its vertices outwards based on frequencies. Add orbital rings or surrounding particles that react to audio. Use PBR materials (metalness, roughness, emissive).
- **Terrain:** Use a PlaneGeometry. Modify the Y-position of vertices based on frequency data mapped across the plane, creating a landscape effect. Use vertex colors based on height or frequency. Add fog or a reflective plane underneath.
- **Galaxy:** Use BufferGeometry with thousands of particles (Points). Position them in a spiral disk shape. Animate their position (rotation, slight movement) and color based on audio averages (bass, mids, highs). Use AdditiveBlending for a glowing effect.
- **Particles:** General concept - use Points with BufferGeometry. Positions can be random within a volume (sphere, cube) or follow a shape. Animate position, size, or color based on audio data. Add velocity attributes for movement.
- **Geometry Modification:** Take a base geometry (Torus, Box, etc.) and manipulate its vertices or scale based on audio.
- **Color & Material:** Change material properties like color (using HSL shifts based on frequency), emissive intensity, metalness, roughness, or opacity based on audio averages (bassAvg, midAvg, overallAvg).
- **Movement:** Rotate the main group. Add subtle oscillation or random drift. Move objects along paths or push them based on frequency data.
- **Combining:** Mix elements, e.g., a central reactive sphere with orbiting bars, or a terrain with particle clouds reacting differently.
`;

async function generateAiVisualizer() {
    aiGeneratedCodeTextarea.value = ""; // Clear previous code
    aiLoadingIndicator.style.display = 'block'; // Show loading
    aiModal.style.display = 'flex'; // Show modal

    const systemPrompt = `
You are an expert Three.js developer creating audio visualizer modules.
Generate JavaScript code for a *new*, *creative* audio visualizer module compatible with the existing framework.

**Requirements:**
1.  **ESM Module:** Use ES6 module syntax (\`import\`, \`export\`).
2.  **Imports:** Import THREE.js: \`import * as THREE from 'three';\`
3.  **Exports:** Export two functions:
    *   \`createVisualization(scene, config)\`:
        *   Takes the Three.js \`scene\` and the shared \`config\` object as input.
        *   Creates all necessary Three.js objects (Geometries, Materials, Meshes, Points, Groups).
        *   Adds them to a main \`THREE.Group()\` instance.
        *   **Crucially, return this main group.**
        *   Can access configuration via \`config.someNewVizName\` (use a descriptive name). You might need to *invent* reasonable config values (like particle count, colors, sizes, speeds) if they aren't predefined. Assume the user will add a corresponding entry to \`config.js\` later. Use a placeholder name like 'aiGeneratedViz' for the config key.
        *   Store any data needed for updates (like original positions, speeds, indices) in the group's \`userData\` or directly on mesh \`userData\`.
    *   \`updateVisualization(group, dataArray, analyser, sensitivity, config)\`:
        *   Takes the returned \`group\`, the audio \`dataArray\` (Uint8Array), the \`analyser\` object, the \`sensitivity\` float, and the shared \`config\` object.
        *   Updates the properties (position, rotation, scale, color, material properties, etc.) of the objects within the \`group\` based on the audio data.
        *   Use \`dataArray\` values (ranging 0-255). Calculate averages like \`bassAvg\`, \`midAvg\`, \`highAvg\`, \`overallAvg\` or use specific frequency bins (\`dataArray[index]\`). Remember \`analyser.frequencyBinCount\` gives the length of \`dataArray\`.
        *   Use \`sensitivity\` to scale the audio's effect.
        *   Access configuration via \`config.aiGeneratedViz\`.
        *   Mark necessary attributes for update (e.g., \`positions.needsUpdate = true\`, \`colors.needsUpdate = true\`).
        *   Can use \`Date.now()\` for time-based animations (e.g., slow rotation, oscillation).
4.  **Creativity:** Combine ideas or invent new visual effects based on the provided concepts. Don't just copy an existing visualizer exactly. Aim for something visually interesting and responsive to audio.
5.  **Performance:** Be mindful of performance. Avoid overly complex calculations in the update loop, especially inside loops over many vertices or particles. Limit particle/vertex counts to reasonable numbers (e.g., < 50000 particles, < 256x256 terrain segments unless necessary).
6.  **Error Handling:** Assume the inputs (\`group\`, \`dataArray\`, etc.) are valid within the functions. No need for explicit null checks inside the generated functions.
7.  **Output:** Respond *only* with the JavaScript code block for the module. Do not include any other text, explanation, or markdown formatting.

**Inspiration / Puzzle Pieces (Combine or adapt these):**
${VISUALIZATION_IDEAS}

**Example Calculation:**
\`const bassAvg = (dataArray[0] + dataArray[1] + dataArray[2]) / (3 * 255);\`
\`const freqIndex = Math.floor((i / particleCount) * analyser.frequencyBinCount);\`
\`const height = (dataArray[freqIndex] / 255.0) * config.aiGeneratedViz.maxHeight * sensitivity;\`

Generate a new visualizer module code now.
`;

    try {
        // Maintain a short history for potential follow-up refinements (optional here)
        llmConversationHistory.push({ role: "user", content: "Generate a new visualizer module." });
        llmConversationHistory = llmConversationHistory.slice(-4); // Keep history short

        const completion = await websim.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                ...llmConversationHistory
            ],
        });

        const generatedCode = completion.content;
        llmConversationHistory.push(completion); // Add AI response to history
        aiGeneratedCodeTextarea.value = generatedCode;

    } catch (error) {
        console.error('Error generating AI visualization:', error);
        aiGeneratedCodeTextarea.value = `// Error generating visualization:\n// ${error.message}\n\n// Please check the console for more details and try again.`;
    } finally {
        aiLoadingIndicator.style.display = 'none'; // Hide loading
    }

}

function showModal() {
    aiModal.style.display = 'flex';
}

function hideModal() {
    aiModal.style.display = 'none';
}

// Animation loop
function animate() {
    requestAnimationFrame(animate); // Schedule next frame

    if (analyser && dataArray) { // Only update if audio is active
        updateVisualization();
    }

    controls.update(); // Update orbit controls (includes auto-rotate)
    renderer.render(scene, camera); // Render the scene
}

// Event listeners
startButton.addEventListener('click', setupAudioCapture);

smoothingSlider.addEventListener('input', (e) => {
    if (analyser) {
        analyser.smoothingTimeConstant = parseFloat(e.target.value);
    }
});

visualizationTypeSelector.addEventListener('change', async (e) => { // Make async
    visualizationType = e.target.value;
    // Only create new visualization if audio is already set up
    if (scene && analyser && audioContext && audioContext.state === 'running') {
        await createVisualization(visualizationType);
    } else if (scene && !analyser) {
        // If audio isn't running, just prepare the type for when it starts
        // No need to call createVisualization here, it will be called in setupAudioCapture
    }
});

aiGenerateButton.addEventListener('click', generateAiVisualizer);
closeModalButton.addEventListener('click', hideModal);
// Close modal if clicking outside the content area
window.addEventListener('click', (event) => {
    if (event.target === aiModal) {
        hideModal();
    }
});

// Initialize everything
initScene();