import * as THREE from 'three';
import { config } from '../config';

export function createBarVisualization() {
    const group = new THREE.Group();
    const barGeometry = new THREE.BoxGeometry(1, 1, 1);
    const barMaterial = new THREE.MeshPhysicalMaterial({
        color: config.bars.color1,
        metalness: 0.5,
        roughness: 0.2,
        transparent: true,
        opacity: 0.8,
        emissive: 0x222222
    });
    
    const totalBars = config.bars.count;
    const radius = totalBars * 0.2;
    
    // Add core glow sphere
    const coreGeometry = new THREE.SphereGeometry(radius * 0.3, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(core);
    
    // Create particle system for ambience
    const particleGeometry = new THREE.BufferGeometry();
    const particleCount = 500;
    const particlePositions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount * 3; i += 3) {
        const angle = Math.random() * Math.PI * 2;
        const radiusVariance = radius * (1 + Math.random() * 1.5);
        particlePositions[i] = Math.sin(angle) * radiusVariance;
        particlePositions[i+1] = (Math.random() - 0.5) * radius;
        particlePositions[i+2] = Math.cos(angle) * radiusVariance;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.8,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    group.add(particles);
    
    for (let i = 0; i < totalBars; i++) {
        const bar = new THREE.Mesh(barGeometry, barMaterial.clone());
        const angle = (i / totalBars) * Math.PI * 2;
        
        bar.position.x = Math.sin(angle) * radius;
        bar.position.z = Math.cos(angle) * radius;
        bar.position.y = 0.5;
        bar.scale.y = config.bars.initialHeight;
        
        // Store original positions for animation
        bar.userData = {
            index: i,
            angle: angle
        };
        
        // Color gradient based on position
        const hue = i / totalBars;
        bar.material.color.setHSL(hue, 1.0, 0.5);
        
        group.add(bar);
    }
    
    return group;
}

export function updateBarVisualization(visualizer, dataArray, sensitivity) {
    const bars = visualizer.children.filter((child, index) => index >= 2); // Skip core and particles
    const totalBars = bars.length;
    const core = visualizer.children[0];
    const particles = visualizer.children[1];
    
    // Calculate average frequency for core effects
    const averageFrequency = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length / 255;
    
    // Update core based on bass frequencies
    const bassPower = (dataArray[0] + dataArray[1] + dataArray[2]) / (3 * 255);
    core.scale.set(
        1 + bassPower * 0.5,
        1 + bassPower * 0.5,
        1 + bassPower * 0.5
    );
    
    core.material.opacity = 0.2 + bassPower * 0.5;
    core.material.color.setHSL(bassPower * 0.2, 0.8, 0.5);
    
    // Update particles
    const particlePositions = particles.geometry.attributes.position;
    for (let i = 0; i < particlePositions.count; i++) {
        const idx = i % dataArray.length;
        const frequencyValue = dataArray[idx] / 255.0;
        
        // Get current position
        const x = particlePositions.getX(i);
        const y = particlePositions.getY(i);
        const z = particlePositions.getZ(i);
        
        // Calculate direction to center
        const dir = new THREE.Vector3(x, y, z).normalize();
        
        // Move particles based on audio 
        const newDist = (totalBars * 0.2) * (1 + frequencyValue * 2);
        const newPos = dir.multiplyScalar(newDist);
        
        particlePositions.setXYZ(i, newPos.x, (y * 0.98) + (Math.random() - 0.5) * 0.5, newPos.z);
    }
    
    particlePositions.needsUpdate = true;
    particles.material.opacity = 0.2 + averageFrequency * 0.6;
    
    // Update bars
    for (let i = 0; i < totalBars; i++) {
        const bar = bars[i];
        
        // Map the bar to a frequency bin
        const frequencyIndex = Math.floor(i / totalBars * (dataArray.length / 2));
        const value = dataArray[frequencyIndex] / 255;
        
        // Apply the value with sensitivity
        const targetHeight = value * config.bars.maxHeight * sensitivity + config.bars.initialHeight;
        
        // Smooth transition
        bar.scale.y += (targetHeight - bar.scale.y) * 0.2;
        
        // Scale width based on audio intensity for bulging effect
        bar.scale.x = 1 + value * 0.5;
        bar.scale.z = 1 + value * 0.5;
        
        // Update bar position so it grows from the bottom
        bar.position.y = bar.scale.y / 2;
        
        // Add some movement based on low frequencies
        const angle = bar.userData.angle + bassPower * 0.2 + (i / totalBars) * 0.1; 
        const radius = totalBars * 0.2 * (1 + bassPower * 0.3 + value * 0.1);
        
        bar.position.x = Math.sin(angle) * radius;
        bar.position.z = Math.cos(angle) * radius;
        
        // Update color based on height
        bar.material.color.setHSL(
            ((i / totalBars) + (value * 0.2)) % 1.0, 
            0.7, 
            0.4 + value * 0.6
        );
        
        // Update material properties
        bar.material.emissiveIntensity = value * 0.5;
        bar.material.metalness = 0.3 + value * 0.7;
        bar.material.opacity = 0.6 + value * 0.4;
    }
    
    // Rotate the entire bar group
    visualizer.rotation.y += 0.003;
}