import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config } from './config.js';
// Static visualization modules are no longer directly used for switching,
// but keep them imported if the LLM needs examples or if we want a fallback.
import * as Bars from './visualizations/bars.js';
import * as Sphere from './visualizations/sphere.js';
import * as Terrain from './visualizations/terrain.js';
import * as Galaxy from './visualizations/galaxy.js';

// Main variables
let scene, camera, renderer, analyser, dataArray;
let audioContext, mediaStreamSource;
let activeVisualization = null; // This will hold the group/object returned by the create function
let activeVisualizationModule = null; // This will hold the dynamically imported module
let controls;
let dynamicGenerationInterval = null;
const GENERATION_INTERVAL = 90 * 1000; // 90 seconds
let generationInProgress = false;
let retryTimeout = null;

// DOM elements
const startButton = document.getElementById('startButton');
const statusElement = document.getElementById('status');
const sensitivitySlider = document.getElementById('sensitivity');
const smoothingSlider = document.getElementById('smoothing');
const dynamicStatusElement = document.getElementById('dynamic-status');

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

// --- Dynamic Visualization Generation ---

const LLM_PROMPT = `
You are an expert Three.js developer creating audio visualizations.
Generate JavaScript code for a *new* and *unique* audio visualizer component.
The code must be a valid JavaScript ES module.
It must export two functions:
1.  \`createVisualization(scene, config)\`:
    *   Receives the Three.js \`scene\` and a \`config\` object.
    *   Must create and return a single Three.js \`Group\` or \`Object3D\` containing all visualization elements.
    *   Can use any Three.js features (geometries, materials, particles, meshes, lights within the group).
    *   The \`config\` object contains parameters the user might want to tune (example structure below). You can define reasonable defaults within the generated code or assume they exist in a hypothetical section of the passed \`config\`.
    *   Example config structure passed to your function (feel free to use these or define your own structure within your code):
        \`\`\`javascript
        {
            someVisualizationName: { // Use a descriptive name based on your visualization
                param1: value1,
                param2: value2,
                color1: 0xff00ff,
                // ... other specific params ...
            },
            // Potentially other visualization configs exist
            audio: { fftSize: 256, ... }, // You probably won't need audio config here
            camera: { ... } // You probably won't need camera config here
        }
        \`\`\`

2.  \`updateVisualization(group, dataArray, analyser, sensitivity, config)\`:
    *   Receives the \`group\` returned by \`createVisualization\`, the \`dataArray\` (Uint8Array of frequency data), the \`analyser\` node, a \`sensitivity\` float (usually 0.5-5), and the same \`config\` object.
    *   Must update the elements within the \`group\` based on the \`dataArray\` and \`sensitivity\`.
    *   \`dataArray\` length is \`analyser.frequencyBinCount\`. Values are 0-255. Index 0 is low frequencies, higher indices are higher frequencies.
    *   Make the visualization react dynamically and interestingly to the audio. Use bass, mid, high frequencies creatively.

Constraints & Requirements:
*   Use \`import * as THREE from 'three';\` for Three.js. Do NOT import OrbitControls or anything else from addons.
*   Focus on visual creativity and responsiveness to audio. Try complex particle systems, geometry deformations, shader materials (if you are comfortable, but standard materials are fine), or combinations.
*   Do NOT include any setup code for scene, camera, renderer, audio context, or the animation loop. Only provide the module code with the two exported functions.
*   The code should be self-contained within the module, defining necessary variables inside the functions or module scope.
*   Respond ONLY with the raw JavaScript code for the module. Do not wrap it in markdown backticks (\`\`\`), do not add explanations, comments outside the code, or any other text. Just the code itself.
*   Make this visualization significantly different from typical bar, sphere, or terrain visualizers. Think abstract, generative, or physics-based if possible.
`;

async function generateAndLoadVisualization() {
    if (generationInProgress) return;
    generationInProgress = true;
    clearTimeout(retryTimeout); // Clear any pending retries
    dynamicStatusElement.textContent = 'Generating new visualization...';
    console.log("Requesting new visualization from LLM...");

    try {
        const completion = await websim.chat.completions.create({
            messages: [
                // We don't need conversation history here, each request is independent.
                { role: "system", content: LLM_PROMPT },
                { role: "user", content: "Generate a new, unique audio visualizer module code." },
            ],
            temperature: 0.8, // Encourage variety
            // No json: true needed, we want raw code string
        });

        const generatedCode = completion.content.trim();
        console.log("LLM generated code:\n", generatedCode);

        if (!generatedCode || !generatedCode.includes('export function createVisualization') || !generatedCode.includes('export function updateVisualization')) {
            throw new Error("LLM response did not contain valid visualization code structure.");
        }

        dynamicStatusElement.textContent = 'Loading visualization...';
        await loadDynamicVisualization(generatedCode);
        dynamicStatusElement.textContent = 'Visualization loaded. Next update in 90s.';

    } catch (error) {
        console.error('Error generating or loading visualization:', error);
        dynamicStatusElement.textContent = `Error: ${error.message}. Retrying in 10s...`;
        // Retry after a delay
        retryTimeout = setTimeout(() => {
            generationInProgress = false; // Allow retry
            generateAndLoadVisualization();
        }, 10000); // Retry after 10 seconds
    } finally {
        // Only set generationInProgress to false if NOT retrying immediately
        if (!retryTimeout) {
            generationInProgress = false;
        }
    }
}

async function loadDynamicVisualization(code) {
    // Remove existing visualization
    if (activeVisualization) {
        scene.remove(activeVisualization);
        // TODO: Add proper disposal of geometries, materials, textures if needed
        activeVisualization = null;
        activeVisualizationModule = null;
    }

    try {
        // Use dynamic import with a data URL to load the generated module code
        const dataUrl = `data:text/javascript,${encodeURIComponent(code)}`;
        activeVisualizationModule = await import(dataUrl);

        if (!activeVisualizationModule || typeof activeVisualizationModule.createVisualization !== 'function' || typeof activeVisualizationModule.updateVisualization !== 'function') {
            throw new Error("Dynamically imported module is invalid or missing required functions.");
        }

        // Create the new visualization
        // Pass a *copy* or a relevant part of the config to avoid modifications?
        // For now, pass the whole config. The LLM prompt guides it.
        activeVisualization = activeVisualizationModule.createVisualization(scene, config);

        if (activeVisualization && activeVisualization instanceof THREE.Object3D) {
            scene.add(activeVisualization);
            console.log("Dynamic visualization added to scene.");
        } else {
            throw new Error("createVisualization function did not return a valid THREE.Object3D.");
        }
    } catch (error) {
        console.error("Error executing dynamic visualization code:", error);
        activeVisualization = null; // Ensure it's cleared on error
        activeVisualizationModule = null;
        dynamicStatusElement.textContent = `Error loading code: ${error.message}. Waiting for next generation.`;
        // Let the interval timer try again next time.
    }
}

function startDynamicGeneration() {
    if (dynamicGenerationInterval) {
        clearInterval(dynamicGenerationInterval);
    }
    // Generate the first one immediately
    generateAndLoadVisualization();
    // Then generate subsequent ones on interval
    dynamicGenerationInterval = setInterval(generateAndLoadVisualization, GENERATION_INTERVAL);
}

function stopDynamicGeneration() {
    if (dynamicGenerationInterval) {
        clearInterval(dynamicGenerationInterval);
        dynamicGenerationInterval = null;
    }
    clearTimeout(retryTimeout);
    dynamicStatusElement.textContent = 'Dynamic generation stopped.';
}

// Audio capture and analysis setup
async function setupAudioCapture() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
            preferCurrentTab: false,
            selfBrowserSurface: "exclude",
            systemAudio: "include"
        });

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            throw new Error('No audio track found. Please select a tab with audio.');
        }
        stream.getVideoTracks().forEach(track => track.stop());

        statusElement.textContent = 'Audio capture started';
        startButton.textContent = 'Change Tab Source';

        if (audioContext) {
            await audioContext.close();
            stopDynamicGeneration(); // Stop generation when audio stops
        }

        audioContext = new AudioContext();
        mediaStreamSource = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();

        analyser.fftSize = config.audio.fftSize;
        analyser.minDecibels = config.audio.minDecibels;
        analyser.maxDecibels = config.audio.maxDecibels;
        analyser.smoothingTimeConstant = parseFloat(smoothingSlider.value);

        mediaStreamSource.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Start dynamic generation *instead* of creating a static one
        startDynamicGeneration();

        if (!renderer) return;
        if (renderer.info.render.frame === 0) {
            animate();
        }

        stream.getAudioTracks()[0].onended = () => {
            statusElement.textContent = 'Audio capture stopped';
            startButton.textContent = 'Start Visualizer';
            stopDynamicGeneration(); // Stop generation when audio stops
            if (activeVisualization) {
                scene.remove(activeVisualization);
                activeVisualization = null;
                activeVisualizationModule = null;
            }
            // analyser = null; // Clear analyser?
            // dataArray = null;
        };

    } catch (error) {
        console.error('Error capturing audio:', error);
        statusElement.textContent = 'Error: ' + error.message;
        startButton.textContent = 'Try Again';
        stopDynamicGeneration();
    }
}

// Update visualization function (calls the dynamically loaded module's update)
function updateVisualization() {
    if (!analyser || !activeVisualization || !activeVisualizationModule || !dataArray || !activeVisualizationModule.updateVisualization) return;

    analyser.getByteFrequencyData(dataArray);
    const sensitivity = parseFloat(sensitivitySlider.value);

    try {
        activeVisualizationModule.updateVisualization(activeVisualization, dataArray, analyser, sensitivity, config);
    } catch (error) {
        console.error("Error during visualization update:", error);
        // Stop updating this broken viz and try generating a new one immediately
        if (activeVisualization) {
            scene.remove(activeVisualization);
        }
        activeVisualization = null;
        activeVisualizationModule = null;
        dynamicStatusElement.textContent = `Runtime Error: ${error.message}. Generating new visualization...`;
        stopDynamicGeneration(); // Stop interval
        generationInProgress = false; // Allow immediate generation
        generateAndLoadVisualization(); // Trigger regeneration now
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    if (analyser && dataArray && activeVisualization) { // Check if visualization exists
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

// Initialize everything
initScene();
animate(); // Start rendering loop immediately, even without audio/viz