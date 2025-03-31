import * as THREE from 'three';

// Vertices of a tesseract projected into 3D.
// Derived from standard projection formulas. Assumes center at origin.
// Coordinates are +/- 1, scaled later by 'size'. Inner cube vertices scaled by 'innerCubeSizeFactor'.
const tesseractVertices = [
    // Outer cube (+w)
    [-1, -1, -1, 1], [-1, -1, 1, 1], [-1, 1, -1, 1], [-1, 1, 1, 1],
    [ 1, -1, -1, 1], [ 1, -1, 1, 1], [ 1, 1, -1, 1], [ 1, 1, 1, 1],
    // Inner cube (-w)
    [-1, -1, -1, -1], [-1, -1, 1, -1], [-1, 1, -1, -1], [-1, 1, 1, -1],
    [ 1, -1, -1, -1], [ 1, -1, 1, -1], [ 1, 1, -1, -1], [ 1, 1, 1, -1],
];

// Edges connecting the vertices (indices into tesseractVertices array)
const tesseractEdges = [
    // Outer cube edges
    [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7],
    // Inner cube edges
    [8, 9], [8, 10], [8, 12], [9, 11], [9, 13], [10, 11], [10, 14], [11, 15], [12, 13], [12, 14], [13, 15], [14, 15],
    // Connecting edges between inner and outer cubes
    [0, 8], [1, 9], [2, 10], [3, 11], [4, 12], [5, 13], [6, 14], [7, 15]
];

let lineSegments, ambientParticles, edgeParticles;
let originalVertexPositions = []; // Store base positions for distortion
let edgeParticleData = []; // Store { index, t (position along edge), speed }

// Simple perspective projection from 4D to 3D
function project4Dto3D(v4, scale = 1, distance = 2) {
    const [x, y, z, w] = v4;
    // Perspective projection: perspective = 1 / (distance - w)
    // Orthographic is simpler for this effect: just ignore w or use it for scaling
    // We'll use w to modulate the scale slightly, simulating perspective
    const perspectiveFactor = distance / (distance - w * 0.5); // Simple perspective scaling based on w
    return new THREE.Vector3(x, y, z).multiplyScalar(scale * perspectiveFactor);
}

export function createVisualization(scene, config) {
    const group = new THREE.Group();
    const cfg = config.hypercube;

    originalVertexPositions = [];
    const vertices3D = [];
    for (let i = 0; i < tesseractVertices.length; i++) {
        const v4 = tesseractVertices[i];
        // Scale inner cube vertices differently
        const scale = (i < 8) ? cfg.size : cfg.size * cfg.innerCubeSizeFactor;
        const v3 = project4Dto3D(v4, scale);
        vertices3D.push(v3.x, v3.y, v3.z);
        originalVertexPositions.push(v3.clone()); // Store the Vector3 object
    }

    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(tesseractEdges.length * 2 * 3); // 2 vertices per edge, 3 coords per vertex
    const lineColors = new Float32Array(tesseractEdges.length * 2 * 3);

    const colorInner = new THREE.Color(cfg.colorInnerBase);
    const colorOuter = new THREE.Color(cfg.colorOuterBase);
    const colorConnect = new THREE.Color(cfg.colorConnectBase);

    for (let i = 0; i < tesseractEdges.length; i++) {
        const startIdx = tesseractEdges[i][0];
        const endIdx = tesseractEdges[i][1];

        linePositions[i * 6 + 0] = vertices3D[startIdx * 3 + 0];
        linePositions[i * 6 + 1] = vertices3D[startIdx * 3 + 1];
        linePositions[i * 6 + 2] = vertices3D[startIdx * 3 + 2];
        linePositions[i * 6 + 3] = vertices3D[endIdx * 3 + 0];
        linePositions[i * 6 + 4] = vertices3D[endIdx * 3 + 1];
        linePositions[i * 6 + 5] = vertices3D[endIdx * 3 + 2];

        let color;
        if (startIdx < 8 && endIdx < 8) color = colorOuter; // Outer edge
        else if (startIdx >= 8 && endIdx >= 8) color = colorInner; // Inner edge
        else color = colorConnect; // Connecting edge

        lineColors[i * 6 + 0] = color.r;
        lineColors[i * 6 + 1] = color.g;
        lineColors[i * 6 + 2] = color.b;
        lineColors[i * 6 + 3] = color.r;
        lineColors[i * 6 + 4] = color.g;
        lineColors[i * 6 + 5] = color.b;
    }

    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: cfg.lineWidth, // Note: linewidth > 1 ignored on some platforms
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });

    lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
    group.add(lineSegments);

    // --- Edge Particles ---
    const edgeParticleGeometry = new THREE.BufferGeometry();
    const edgeParticlePositions = new Float32Array(cfg.particleCountEdge * 3);
    const edgeParticleColors = new Float32Array(cfg.particleCountEdge * 3); // Colors for edge particles
    edgeParticleData = []; // Reset particle data

    for (let i = 0; i < cfg.particleCountEdge; i++) {
        const edgeIndex = Math.floor(Math.random() * tesseractEdges.length);
        const t = Math.random(); // Position along the edge (0 to 1)
        const startVertIndex = tesseractEdges[edgeIndex][0];
        const endVertIndex = tesseractEdges[edgeIndex][1];

        const startPos = originalVertexPositions[startVertIndex];
        const endPos = originalVertexPositions[endVertIndex];
        const particlePos = new THREE.Vector3().lerpVectors(startPos, endPos, t);

        edgeParticlePositions[i * 3 + 0] = particlePos.x;
        edgeParticlePositions[i * 3 + 1] = particlePos.y;
        edgeParticlePositions[i * 3 + 2] = particlePos.z;

        // Determine color based on edge type
        let edgeColor;
        if (startVertIndex < 8 && endVertIndex < 8) edgeColor = colorOuter;
        else if (startVertIndex >= 8 && endVertIndex >= 8) edgeColor = colorInner;
        else edgeColor = colorConnect;

        const particleColor = edgeColor.clone().multiplyScalar(0.8 + Math.random() * 0.4); // Add brightness variation
        edgeParticleColors[i * 3 + 0] = particleColor.r;
        edgeParticleColors[i * 3 + 1] = particleColor.g;
        edgeParticleColors[i * 3 + 2] = particleColor.b;


        edgeParticleData.push({
            edgeIndex: edgeIndex,
            t: t,
            speed: (Math.random() - 0.5) * 0.02, // Base random speed & direction
            colorBase: particleColor // Store base color
        });
    }

    edgeParticleGeometry.setAttribute('position', new THREE.BufferAttribute(edgeParticlePositions, 3));
     edgeParticleGeometry.setAttribute('color', new THREE.BufferAttribute(edgeParticleColors, 3)); // Set colors

    const edgeParticleMaterial = new THREE.PointsMaterial({
        size: cfg.particleSizeEdge,
        vertexColors: true, // Use vertex colors
        transparent: true,
        opacity: cfg.particleOpacityEdge,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        depthWrite: false,
    });
    edgeParticles = new THREE.Points(edgeParticleGeometry, edgeParticleMaterial);
    group.add(edgeParticles);


    // --- Ambient Particles ---
    const ambientGeometry = new THREE.BufferGeometry();
    const ambientPositions = new Float32Array(cfg.particleCountAmbient * 3);
    const ambientColors = new Float32Array(cfg.particleCountAmbient * 3);
    const ambientVelocities = new Float32Array(cfg.particleCountAmbient * 3);
    const color1 = new THREE.Color(cfg.colorInnerBase);
    const color2 = new THREE.Color(cfg.colorOuterBase);

    for (let i = 0; i < cfg.particleCountAmbient; i++) {
        const i3 = i * 3;
        // Distribute in a sphere around the hypercube
        const radius = Math.random() * cfg.ambientSpread;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        ambientPositions[i3]   = radius * Math.sin(phi) * Math.cos(theta);
        ambientPositions[i3+1] = radius * Math.sin(phi) * Math.sin(theta);
        ambientPositions[i3+2] = radius * Math.cos(phi);

        ambientVelocities[i3]   = (Math.random() - 0.5) * 0.1;
        ambientVelocities[i3+1] = (Math.random() - 0.5) * 0.1;
        ambientVelocities[i3+2] = (Math.random() - 0.5) * 0.1;

        const color = color1.clone().lerp(color2, Math.random());
        ambientColors[i3]   = color.r;
        ambientColors[i3+1] = color.g;
        ambientColors[i3+2] = color.b;
    }
    ambientGeometry.setAttribute('position', new THREE.BufferAttribute(ambientPositions, 3));
    ambientGeometry.setAttribute('velocity', new THREE.BufferAttribute(ambientVelocities, 3));
    ambientGeometry.setAttribute('color', new THREE.BufferAttribute(ambientColors, 3));

    const ambientMaterial = new THREE.PointsMaterial({
        size: cfg.particleSizeAmbient,
        vertexColors: true,
        transparent: true,
        opacity: cfg.particleOpacityAmbient,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        depthWrite: false,
    });
    ambientParticles = new THREE.Points(ambientGeometry, ambientMaterial);
    group.add(ambientParticles);


    return group;
}


export function updateVisualization(group, dataArray, analyser, sensitivity, config) {
    if (!group || !lineSegments || !edgeParticles || !ambientParticles) return;

    const cfg = config.hypercube;
    const bufferLength = analyser.frequencyBinCount;
    const time = Date.now() * 0.0002;

    // Calculate average frequency levels
    const bassAvg = (dataArray[0] + dataArray[1] + dataArray[2] + dataArray[3]) / (4 * 255); // Wider bass range
    const midAvg = dataArray.slice(Math.floor(bufferLength * 0.1), Math.floor(bufferLength * 0.6)).reduce((s, v) => s + v, 0) / (bufferLength * 0.5 * 255);
    const highAvg = dataArray.slice(Math.floor(bufferLength * 0.6)).reduce((s, v) => s + v, 0) / (bufferLength * 0.4 * 255);
    const overallAvg = (bassAvg + midAvg + highAvg) / 3;

    // --- Update Hypercube Vertex Positions ---
    const linePositions = lineSegments.geometry.attributes.position;
    const lineColors = lineSegments.geometry.attributes.color;
    const currentVertexPositions = []; // Store updated positions for particle calculation

    const colorInner = new THREE.Color(cfg.colorInnerBase);
    const colorOuter = new THREE.Color(cfg.colorOuterBase);
    const colorConnect = new THREE.Color(cfg.colorConnectBase);

    for (let i = 0; i < originalVertexPositions.length; i++) {
        const basePos = originalVertexPositions[i];
        const direction = basePos.clone().normalize(); // Direction from center

        // Use different frequencies for inner/outer distortion
        let freqInfluence, distortionScale;
        if (i < 8) { // Outer vertices
            freqInfluence = highAvg;
            distortionScale = 1.0 + highAvg * 0.5; // Outer pulses with highs
        } else { // Inner vertices
            freqInfluence = bassAvg;
            distortionScale = 1.0 + bassAvg * 1.0; // Inner pulses more strongly with bass
        }

        const distortionAmount = freqInfluence * cfg.vertexDistortion * sensitivity * (1 + Math.sin(time * 5 + i * 0.5) * 0.2); // Add ripple
        const distortedPos = basePos.clone().multiplyScalar(distortionScale).add(direction.multiplyScalar(distortionAmount));

        // Add twist based on highs (affect outer cube more)
        if (i < 8) {
            const twistAngle = highAvg * cfg.twistFactor * sensitivity * Math.sign(basePos.x || 0.1); // Twist around Y based on X position
            distortedPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), twistAngle);
        }

        currentVertexPositions.push(distortedPos);
    }

    // Update line geometry positions and colors
    for (let i = 0; i < tesseractEdges.length; i++) {
        const startIdx = tesseractEdges[i][0];
        const endIdx = tesseractEdges[i][1];
        const startPos = currentVertexPositions[startIdx];
        const endPos = currentVertexPositions[endIdx];

        linePositions.setXYZ(i * 2, startPos.x, startPos.y, startPos.z);
        linePositions.setXYZ(i * 2 + 1, endPos.x, endPos.y, endPos.z);

        // Update line colors based on audio intensity
        let baseColor;
        let intensityFactor;
        if (startIdx < 8 && endIdx < 8) { baseColor = colorOuter; intensityFactor = highAvg; }
        else if (startIdx >= 8 && endIdx >= 8) { baseColor = colorInner; intensityFactor = bassAvg; }
        else { baseColor = colorConnect; intensityFactor = midAvg; }

        const color = baseColor.clone().multiplyScalar(0.6 + intensityFactor * 1.5);
        color.clamp(new THREE.Color(0,0,0), new THREE.Color(1,1,1)); // Clamp colors

        lineColors.setXYZ(i * 2, color.r, color.g, color.b);
        lineColors.setXYZ(i * 2 + 1, color.r, color.g, color.b);
    }
    linePositions.needsUpdate = true;
    lineColors.needsUpdate = true;
    lineSegments.material.linewidth = cfg.lineWidth * (1 + overallAvg * 0.5); // Make lines thicker with volume


    // --- Update Edge Particles ---
    const edgeParticlePositions = edgeParticles.geometry.attributes.position;
    const edgeParticleColors = edgeParticles.geometry.attributes.color; // Get color attribute
    const midSpeedFactor = midAvg * cfg.particleSpeedFactor * sensitivity;

    for (let i = 0; i < cfg.particleCountEdge; i++) {
        const data = edgeParticleData[i];
        const edgeIndex = data.edgeIndex;
        const startVertIndex = tesseractEdges[edgeIndex][0];
        const endVertIndex = tesseractEdges[edgeIndex][1];

        // Update particle speed based on audio and inherent speed
        data.speed = data.speed * 0.9 + (Math.random() - 0.5) * 0.005 + Math.sign(data.speed || 0.1) * midSpeedFactor * 0.01;
        data.t += data.speed;

        // Wrap particle around the edge or reset
        if (data.t > 1 || data.t < 0) {
            data.t = data.t % 1.0;
             if (data.t < 0) data.t += 1.0;
            // Optionally, could swap edge here for more complex flow
        }

        // Calculate position along the *current* distorted edge
        const startPos = currentVertexPositions[startVertIndex];
        const endPos = currentVertexPositions[endVertIndex];
        const particlePos = new THREE.Vector3().lerpVectors(startPos, endPos, data.t);
        edgeParticlePositions.setXYZ(i, particlePos.x, particlePos.y, particlePos.z);

        // Update particle color brightness based on mids
        const particleColor = data.colorBase.clone().multiplyScalar(0.7 + midAvg * 1.3);
        particleColor.clamp(new THREE.Color(0,0,0), new THREE.Color(1,1,1));
        edgeParticleColors.setXYZ(i, particleColor.r, particleColor.g, particleColor.b);
    }
    edgeParticlePositions.needsUpdate = true;
    edgeParticleColors.needsUpdate = true;
    edgeParticles.material.size = cfg.particleSizeEdge * (1 + midAvg * 0.5);


    // --- Update Ambient Particles ---
    const ambientPositions = ambientParticles.geometry.attributes.position;
    const ambientVelocities = ambientParticles.geometry.attributes.velocity;
    const ambientColors = ambientParticles.geometry.attributes.color;

    for (let i = 0; i < cfg.particleCountAmbient; i++) {
        const i3 = i * 3;

        // Add force towards/away from center based on overall volume
        const posVec = new THREE.Vector3(ambientPositions.array[i3], ambientPositions.array[i3+1], ambientPositions.array[i3+2]);
        const direction = posVec.clone().normalize();
        const force = direction.multiplyScalar((overallAvg - 0.2) * 0.1 * sensitivity); // Push out when loud, pull in when quiet

        ambientVelocities.array[i3]   += force.x + (Math.random() - 0.5) * 0.01; // Add random jitter
        ambientVelocities.array[i3+1] += force.y + (Math.random() - 0.5) * 0.01;
        ambientVelocities.array[i3+2] += force.z + (Math.random() - 0.5) * 0.01;

        // Apply velocity and damping
        ambientPositions.array[i3]   += ambientVelocities.array[i3];
        ambientPositions.array[i3+1] += ambientVelocities.array[i3+1];
        ambientPositions.array[i3+2] += ambientVelocities.array[i3+2];
        ambientVelocities.array[i3]   *= 0.96; // Damping
        ambientVelocities.array[i3+1] *= 0.96;
        ambientVelocities.array[i3+2] *= 0.96;

        // Return to origin sphere if too far
        const distSq = posVec.lengthSq();
        if (distSq > (cfg.ambientSpread * 1.2)**2) {
             ambientVelocities.array[i3]   -= direction.x * 0.1;
             ambientVelocities.array[i3+1] -= direction.y * 0.1;
             ambientVelocities.array[i3+2] -= direction.z * 0.1;
        }

        // Update ambient color brightness/hue based on audio
         const baseColor = new THREE.Color().fromArray(ambientColors.array, i3); // Read base color back? No, need initial state. Let's calculate dynamically.
         const color1 = new THREE.Color(cfg.colorInnerBase);
         const color2 = new THREE.Color(cfg.colorOuterBase);
         const hueLerp = 0.5 + (highAvg - bassAvg) * 0.5; // Shift hue between inner/outer colors based on freq balance
         const brightness = 0.3 + overallAvg * 1.2;
         const color = color1.clone().lerp(color2, hueLerp).multiplyScalar(brightness);
         color.clamp(new THREE.Color(0,0,0), new THREE.Color(1,1,1));
         ambientColors.setXYZ(i, color.r, color.g, color.b);
    }
    ambientPositions.needsUpdate = true;
    ambientVelocities.needsUpdate = true; // If needed elsewhere
    ambientColors.needsUpdate = true;
    ambientParticles.material.opacity = cfg.particleOpacityAmbient * (0.5 + overallAvg);

    // Optional: Rotate the whole group slowly
    // group.rotation.x += 0.0001;
    // group.rotation.y += 0.0002;
}