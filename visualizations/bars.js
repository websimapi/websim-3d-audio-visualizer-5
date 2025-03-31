import * as THREE from 'three';

let core, particles, barsGroup;

export function createVisualization(scene, config) {
    const group = new THREE.Group();
    const cfg = config.bars;

    const barGeometry = new THREE.BoxGeometry(1, 1, 1);
    const baseBarMaterial = new THREE.MeshStandardMaterial({
        metalness: 0.4,
        roughness: 0.6,
        transparent: true,
        opacity: 0.85,
        emissive: 0x111111, 
    });

    const totalBars = cfg.count;
    const radius = totalBars * cfg.spacing; 

    const coreGeometry = new THREE.SphereGeometry(radius * cfg.coreRadiusFactor, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending, 
    });
    core = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(core);

    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(cfg.particleCount * 3);
    const particleVelocities = new Float32Array(cfg.particleCount * 3); 

    for (let i = 0; i < cfg.particleCount * 3; i += 3) {
        const angle = Math.random() * Math.PI * 2;
        const dist = radius * (1 + Math.random() * 1.8); 
        const height = (Math.random() - 0.5) * radius * 1.5; 
        particlePositions[i] = Math.sin(angle) * dist;
        particlePositions[i+1] = height;
        particlePositions[i+2] = Math.cos(angle) * dist;

        particleVelocities[i]   = (Math.random() - 0.5) * 0.1;
        particleVelocities[i+1] = (Math.random() - 0.5) * 0.1;
        particleVelocities[i+2] = (Math.random() - 0.5) * 0.1;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute('velocity', new THREE.BufferAttribute(particleVelocities, 3)); 

    const particleMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: cfg.particleSize,
        transparent: true,
        opacity: cfg.particleOpacity,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true, 
    });

    particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.userData.initialRadius = radius; 
    group.add(particles);

    barsGroup = new THREE.Group(); 
    for (let i = 0; i < totalBars; i++) {
        const barMaterial = baseBarMaterial.clone(); 
        const bar = new THREE.Mesh(barGeometry, barMaterial);
        const angle = (i / totalBars) * Math.PI * 2;

        bar.position.x = Math.sin(angle) * radius;
        bar.position.z = Math.cos(angle) * radius;
        bar.position.y = cfg.initialHeight / 2; 
        bar.scale.y = cfg.initialHeight;
        bar.scale.x = 0.8; 
        bar.scale.z = 0.8;

        bar.userData = {
            index: i,
            angle: angle,
            radius: radius,
            baseHue: i / totalBars, 
        };

        bar.material.color.setHSL(bar.userData.baseHue, 0.8, 0.5);
        bar.material.emissive.setHSL(bar.userData.baseHue, 0.8, 0.1); 

        barsGroup.add(bar);
    }
    group.add(barsGroup);
    group.userData.radius = radius; 

    return group; 
}


export function updateVisualization(group, dataArray, analyser, sensitivity, config) {
    if (!group || !core || !particles || !barsGroup) return; 

    const cfg = config.bars;
    const bufferLength = analyser.frequencyBinCount;
    const totalBars = barsGroup.children.length;
    const radius = group.userData.radius;

    const bassAvg = (dataArray[0] + dataArray[1] + dataArray[2]) / (3 * 255);
    const midAvg = dataArray.slice(Math.floor(bufferLength / 4), Math.floor(bufferLength / 2)).reduce((s, v) => s + v, 0) / (bufferLength / 4 * 255);
    const highAvg = dataArray.slice(Math.floor(bufferLength / 2)).reduce((s, v) => s + v, 0) / (bufferLength / 2 * 255);
    const overallAvg = dataArray.reduce((s, v) => s + v, 0) / (bufferLength * 255);

    const coreScale = 1 + bassAvg * 1.5; 
    core.scale.set(coreScale, coreScale, coreScale);
    core.material.opacity = 0.2 + bassAvg * 0.8; 
    core.material.color.setHSL(bassAvg * 0.15, 1.0, 0.6 + bassAvg * 0.3); 

    const particlePositions = particles.geometry.attributes.position;
    const particleVelocities = particles.geometry.attributes.velocity;
    const time = Date.now() * 0.001; 

    for (let i = 0; i < cfg.particleCount; i++) {
        const i3 = i * 3;
        const freqIndex = Math.floor((i / cfg.particleCount) * bufferLength);
        const freqValue = dataArray[freqIndex] / 255.0;

        particlePositions.array[i3]   += particleVelocities.array[i3];
        particlePositions.array[i3+1] += particleVelocities.array[i3+1];
        particlePositions.array[i3+2] += particleVelocities.array[i3+2];

        const currentPos = new THREE.Vector3(particlePositions.array[i3], particlePositions.array[i3+1], particlePositions.array[i3+2]);
        const direction = currentPos.clone().normalize();
        const push = direction.multiplyScalar(freqValue * 0.5 * sensitivity); 
        particleVelocities.array[i3]   += push.x;
        particleVelocities.array[i3+1] += push.y;
        particleVelocities.array[i3+2] += push.z;

        particleVelocities.array[i3]   *= 0.95;
        particleVelocities.array[i3+1] *= 0.95;
        particleVelocities.array[i3+2] *= 0.95;

        particleVelocities.array[i3+1] -= 0.005;

        const distSq = currentPos.lengthSq();
        const maxDistSq = (radius * 3) ** 2;
        if (distSq > maxDistSq) {
             const reflectionFactor = -0.1;
             particleVelocities.array[i3]   += direction.x * reflectionFactor;
             particleVelocities.array[i3+1] += direction.y * reflectionFactor;
             particleVelocities.array[i3+2] += direction.z * reflectionFactor;
        }
    }
    particlePositions.needsUpdate = true;
    particles.material.opacity = Math.min(1.0, cfg.particleOpacity + overallAvg * 0.5); 
    particles.material.color.setHSL(0.6 + midAvg * 0.4, 0.8, 0.7); 

    for (let i = 0; i < totalBars; i++) {
        const bar = barsGroup.children[i];

        const freqIndex = Math.min(bufferLength - 1, Math.floor(i / totalBars * bufferLength * 0.8)); 
        const value = dataArray[freqIndex] / 255.0;

        const targetHeight = Math.max(cfg.initialHeight, value * cfg.maxHeight * sensitivity);
        const lerpFactor = 0.15; 

        bar.scale.y += (targetHeight - bar.scale.y) * lerpFactor;
        bar.position.y = bar.scale.y / 2; 

        const bulge = 1 + value * 0.8 * sensitivity;
        bar.scale.x = 0.8 * bulge;
        bar.scale.z = 0.8 * bulge;

        const dynamicRadius = radius * (1 + bassAvg * 0.3);
        bar.position.x = Math.sin(bar.userData.angle) * dynamicRadius;
        bar.position.z = Math.cos(bar.userData.angle) * dynamicRadius;

        const intensity = Math.min(1.0, bar.scale.y / (cfg.maxHeight * 0.5)); 
        const hue = (bar.userData.baseHue + intensity * 0.1) % 1.0;
        const saturation = 0.7 + intensity * 0.3;
        const lightness = 0.4 + intensity * 0.4;
        const emissiveLightness = 0.1 + intensity * 0.4;

        bar.material.color.setHSL(hue, saturation, lightness);
        bar.material.emissive.setHSL(hue, saturation, emissiveLightness); 
        bar.material.metalness = 0.3 + intensity * cfg.barMetalnessFactor;
        bar.material.roughness = cfg.barRoughnessFactor + (1 - intensity) * 0.4; 
        bar.material.opacity = 0.7 + intensity * cfg.barOpacityFactor;
    }

    group.rotation.y += 0.001 + highAvg * 0.005; 
}