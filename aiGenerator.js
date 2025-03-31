/**
 * Handles the dynamic generation and loading of AI audio visualizers.
 */
export class AiGenerator {
    constructor(config, statusElement, onModuleReadyCallback, onErrorCallback) {
        this.config = config;
        this.statusElement = statusElement;
        this.onModuleReady = onModuleReadyCallback;
        this.onError = onErrorCallback;

        this.analyser = null;
        this.intervalId = null;
        this.currentModule = null;
        this.currentModuleUrl = null;
        this.isGenerating = false; 
        this.generationInterval = 90000; 
        this.retryTimeout = null; 


    }
    
    start(analyser) {
        if (!analyser) {
            this.onError("AnalyserNode required to start AI generator.");
            return;
        }
        this.analyser = analyser;
        this.stop(); 


        console.log("AI Generator Started");
        this.statusElement.textContent = "AI: Initializing...";
        this.generateAndLoadVisualizer(); 


        this.intervalId = setInterval(
            () => this.generateAndLoadVisualizer(),
            this.generationInterval
        );
    }


    stop() {
        console.log("AI Generator Stopped");
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }
        this.cleanupModule();
        this.isGenerating = false;
        this.analyser = null; 
    }


    regenerateNow() {
        console.log("AI Generator: Regenerating.now...");
        this.stop(); 
        if (this.analyser) { 
            this.start(this.analyser);
        } else {
            this.onError("Cannot regenerate AI visualizer without audio analyser.");
        }
    }


    cleanupModule() {
        if (this.currentModuleUrl) {
            URL.revokeObjectURL(this.currentModuleUrl);
            console.log("Revoked AI module URL:", this.currentModuleUrl);
            this.currentModuleUrl = null;
        }
        this.currentModule = null;
    }


    async generateAndLoadVisualizer() {
        if (!this.analyser) {
            console.warn("Cannot generate AI visualizer without audio analyser.");
            this.onError("Audio context lost. Stopping AI.");
            this.stop(); 
            return;
        }
        if (this.isGenerating) {
            console.log("AI generation already in progress, skipping.");
            return;
        }


        this.isGenerating = true;
        this.statusElement.textContent = "AI: Generating...";
        console.log("AI: Generating new visualizer module...");
        try {
            const completion = await websim.chat.completions.create({
                messages: [
                    { role: "system", content: this.getSystemPrompt() },
                    { role: "user", content: "Generate a new, creative audio visualizer module code based on the interface and constraints." }
                ],
            });


            let generatedCode = completion.content;


            if (!generatedCode || typeof generatedCode !== 'string' || generatedCode.trim().length < 50) {
                throw new Error("LLM returned empty or invalid code content.");
            }
            generatedCode = generatedCode.replace(/^```(?:javascript|js)?\s*([\s\S]*?)\s*```$/gm, '$1').trim();


            if (!generatedCode.includes('export function createVisualization') || !generatedCode.includes('export function updateVisualization')) {
                console.warn("LLM output:\n", generatedCode); 
                throw new Error("LLM code missing required 'export function createVisualization' or 'updateVisualization'.");
            }


            this.cleanupModule(); 


            const fullCode = `import * as THREE from 'three';\n${generatedCode}`;
            const blob = new Blob([fullCode], { type: 'application/javascript' });
            this.currentModuleUrl = URL.createObjectURL(blob);
            console.log("Created AI module blob URL:", this.currentModuleUrl);


            this.currentModule = await import(this.currentModuleUrl);


            if (!this.currentModule || typeof this.currentModule.createVisualization !== 'function' || typeof this.currentModule.updateVisualization !== 'function') {
                console.warn("Imported module:", this.currentModule);
                throw new Error("Imported AI module is invalid or missing required functions.");
            }


            console.log("AI module generated and imported successfully.");
            this.statusElement.textContent = "AI: Module Ready";
            this.isGenerating = false;


            if (this.onModuleReady) {
                this.onModuleReady(this.currentModule);
            }


        } catch (error) {
            console.error('AI Generation/Loading Error:', error);
            this.statusElement.textContent = `AI Error: ${error.message.substring(0, 60)}...`;
            this.cleanupModule(); 
            this.isGenerating = false;


            if (this.onError) {
                this.onError(error.message);
            }


            console.log("Scheduling AI generation retry in 15 seconds...");
            this.retryTimeout = setTimeout(() => {
                this.generateAndLoadVisualizer();
            }, 15000); 
        }
        this.retryTimeout = null; 
    }


    getSystemPrompt() {
        const VISUALIZATION_IDEAS = `
        - **Bars:** Arrange objects (like cubes, cylinders) in a circle/grid. Height/color/scale responds to frequencies. Maybe add rotation or core pulse.
        - **Sphere:** Distort Icosahedron/Sphere vertices based on frequencies. Use PBR materials (metalness, roughness, emissive). Add orbiting elements (rings, particles).
        - **Terrain:** PlaneGeometry vertex Y positions modified by frequency map. Use vertex colors. Add fog, reflection, or particle layers. Animate with waves.
        - **Galaxy/Nebula:** Thousands of Points (BufferGeometry). Spiral/cloud shapes. Use AdditiveBlending. Animate position/color based on audio averages (bass, mid, high).
        - **Particles:** Points in a volume (sphere, box) or following paths. Animate position/size/color via audio. Add velocity for physics-like movement.
        - **Geometry Mod:** Scale/rotate/morph a base shape (Torus, Box, Custom) based on audio.
        - **Material Focus:** Less geometry change, more focus on material properties reacting: emissive intensity, color shifts (HSL), roughness/metalness, opacity fades.
        - **Combining:** A central reactive element + background particle field; terrain with objects moving on it reacting to audio.
        `;


        const EXPECTED_INTERFACE = `
        /**
         * Creates the initial visualization objects and adds them to the scene group.
         * @param {THREE.Scene} scene - The main Three.js scene (can be used for fog, background, etc., but prefer adding objects to the returned group).
         * @param {object} config - The global configuration object. Access AI-specific settings via 'config.aiGeneratedViz'.
         * @returns {THREE.Group} A group containing all the visualizer's objects.
         */
        export function createVisualization(scene, config) {
            const group = new THREE.Group();
            const cfg = config.aiGeneratedViz || {}; 


            const particleCount = cfg.particleCount || 5000; 
            const baseColor = new THREE.Color(cfg.baseColor || 0xff00ff);


            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(particleCount * 3);
            for (let i = 0; i < particleCount * 3; i++) {
                positions[i] = (Math.random() - 0.5) * 100;
            }
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const material = new THREE.PointsMaterial({
                color: baseColor,
                size: cfg.particleSize || 1.0, 
                sizeAttenuation: true
            });
            const points = new THREE.Points(geometry, material);
            group.add(points);


            group.userData.particleCount = particleCount; 


            return group; 
        }


        /**
         * Updates the visualization based on the audio data.
         * @param {THREE.Group} group - The group returned by createVisualization.
         * @param {Uint8Array} dataArray - Array of frequency data (0-255). Length is analyser.frequencyBinCount.
         * @param {AnalyserNode} analyser - The audio analyser node.
         * @param {number} sensitivity - A scalar (0.5-5.0) to adjust audio responsiveness.
         * @param {object} config - The global configuration object. Access AI-specific settings via 'config.aiGeneratedViz'.
         */
        export function updateVisualization(group, dataArray, analyser, sensitivity, config) {
            const cfg = config.aiGeneratedViz || {}; 
            const bufferLength = analyser.frequencyBinCount;


            const bassAvg = (dataArray[0] + dataArray[1] + dataArray[2]) / (3 * 255);
            const overallAvg = dataArray.reduce((s, v) => s + v, 0) / (bufferLength * 255);


            const points = group.children[0]; 
            if (!points || !points.geometry) return; 


            const particleCount = group.userData.particleCount || points.geometry.attributes.position.count; 


            const positions = points.geometry.attributes.position; 


            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3;
                const freqIndex = Math.floor((i / particleCount) * bufferLength);
                const freqValue = dataArray[freqIndex] / 255.0;


                points.material.size = (cfg.particleSize || 1.0) * (1 + overallAvg * sensitivity); 
            }


            group.rotation.y += overallAvg * 0.005 * sensitivity;
        }
        `;

        return `You are an expert Three.js developer creating audio visualizer modules dynamically using ES6 module syntax.


        Your Task: Generate JavaScript code for a *new*, *creative* audio visualizer module.


        Output Format:
        - Respond ONLY with the raw JavaScript code for the ES module.
        - DO NOT include markdown formatting like \`\`\`javascript ... \`\`\`.
        - DO NOT include any explanations, comments outside the code, or introductory text.
        - Your code MUST export two functions: \`createVisualization\` and \`updateVisualization\`.
        - Adhere STRICTLY to the function signatures and return types shown in the interface example below.


        Core Requirements & Constraints:
        - **Interface:** Your code MUST fit this structure:
        ${EXPECTED_INTERFACE}
        - **Access Config:** Use \`config.aiGeneratedViz\` for custom parameters (e.g., \`config.aiGeneratedViz.particleCount\`). Provide sensible default values for your specific visualizer.
        - **Audio Data:** Use \`dataArray\` (Uint8Array, length=\`analyser.frequencyBinCount\`) for audio frequencies (0-255). Calculate averages (bass, mid, high) or use specific frequency bins.
        - **Sensitivity:** Use the \`sensitivity\` float (typically 0.5-5.0) passed to \`updateVisualization\` to scale the intensity of audio reactions.
        - **Animation:** Use \`Date.now()\` or time-based calculations for animations independent of audio input.
        - **Updates:** If you modify buffer attribute arrays directly (like \`positions.array[i] = ...\`), set \`attribute.needsUpdate = true;\` (e.g., \`positions.needsUpdate = true;\`). Update material properties directly (e.g., \`material.color.setHSL(...)\`, \`material.opacity = ...\`).
        - **Performance:** Be mindful of performance. Limit extremely high counts of particles/vertices (> 50k-100k) or complex math (trigonometry, physics) inside tight loops iterating over many elements unless necessary for the effect. Prefer simpler calculations where possible.
        - **Creativity:** Aim for a visually interesting and responsive effect. Draw inspiration from the ideas below or invent something new.


        Inspiration (Optional):
        ${VISUALIZATION_IDEAS}


        Generate the JavaScript module code now.`;
    }
}