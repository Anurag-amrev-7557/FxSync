import React, { useState, useRef, useEffect } from 'react';
// Add Three.js and react-three-fiber imports
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Text, Environment } from '@react-three/drei';
import { EffectComposer, GodRays } from '@react-three/postprocessing';
import * as THREE from 'three';

// Enhanced utility to generate a visually distinct color from a string (clientId)
function stringToColor(str) {
  // Fallback for empty/undefined
  if (!str) return '#888888';
  // Hash string to int
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0; // Convert to 32bit int
  }
  // Use HSL for more visually distinct colors
  const hue = Math.abs(hash) % 360;
  const sat = 60 + (Math.abs(hash) % 30); // 60-89%
  const light = 45 + (Math.abs(hash) % 20); // 45-64%
  return `hsl(${hue},${sat}%,${light}%)`;
}

// Utility to clean clientId (remove leading/trailing quotes and whitespace)
function cleanClientId(id) {
  if (typeof id !== 'string') return id;
  return id.replace(/^['"\s]+|['"\s]+$/g, '');
}

// Enhanced initials: supports unicode, ignores empty words, handles single-word names
function getInitials(name) {
  if (!name || typeof name !== 'string') return '';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) {
    // Try to get first two letters if only one word
    return words[0].slice(0, 2).toUpperCase();
  }
  // Otherwise, first letter of first two words
  return (words[0][0] + words[1][0]).toUpperCase();
}

// PulsatingWave: supports both 3D (Three.js) and 2D (SVG) modes
// Usage: <PulsatingWave mode="3d" ... /> or <PulsatingWave mode="2d" ... />

function PulsatingWave({ position, color = '#f3f3f3', mode = '3d', size = 1, svgCenter = [0, 0], svgScale = 1, animate = true }) {
  // Enhanced 3D Speaker-like sound wave with richer effects and more dynamic animation
  if (mode === '3d') {
    const ring1Ref = useRef();
    const ring2Ref = useRef();
    const ring3Ref = useRef();
    const wavefrontRef = useRef();
    const sparkRef = useRef();
    const glowRef = useRef();
    const t = useRef(0);

    // For sparkles
    const [sparklePositions] = useState(() => {
      // Generate a few random points around the rings
      const arr = [];
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        arr.push([
          Math.cos(angle) * 0.32 * size * (1.1 + 0.2 * Math.random()),
          position[1] + 0.01 * (Math.random() - 0.5),
          Math.sin(angle) * 0.32 * size * (1.1 + 0.2 * Math.random()),
        ]);
      }
      return arr;
    });

    useFrame((_, delta) => {
      if (!animate) return;
      t.current += delta;
      // Each ring is a pulse: starts small, expands, fades, then resets
      const duration = 1.6; // seconds for a full pulse
      const delays = [0, 0.5, 1.0]; // staggered start for each ring
      const baseRadius = 0.32 * size;
      const ringWidths = [0.05 * size, 0.08 * size, 0.12 * size];
      const maxScale = [1.7, 2.1, 2.5];
      const opacities = [0.18, 0.11, 0.06]; // slightly stronger
      const colorPulse = 0.7 + 0.3 * Math.sin(t.current * 2.2); // for subtle color pulsing

      const rings = [ring1Ref, ring2Ref, ring3Ref];
      for (let i = 0; i < 3; i++) {
        const localT = ((t.current - delays[i]) % duration + duration) % duration;
        const progress = localT / duration; // 0 to 1
        const scale = 1 + progress * (maxScale[i] - 1);
        if (rings[i].current) {
          rings[i].current.scale.setScalar(scale);
          rings[i].current.material.opacity = opacities[i] * (1 - progress) * (0.8 + 0.2 * colorPulse);
          // Animate color for a subtle "breathing" effect
          rings[i].current.material.color.setHSL(0.6 + 0.08 * Math.sin(t.current + i), 0.1 + 0.08 * colorPulse, 0.95);
        }
      }
      // Vertical wavefront: conical, animated upward, fading
      if (wavefrontRef.current) {
        const waveT = (t.current % 1.2) / 1.2; // 0 to 1
        const height = 0.18 * size + 0.22 * size * waveT;
        wavefrontRef.current.scale.set(1, 1 + 0.7 * waveT, 1);
        wavefrontRef.current.position.y = position[1] + 0.32 * size + height / 2;
        wavefrontRef.current.material.opacity = 0.13 * (1 - waveT) + 0.04 * colorPulse;
        wavefrontRef.current.material.color.setHSL(0.62 + 0.05 * Math.sin(t.current * 1.5), 0.13, 0.98);
      }
      // Animate glow
      if (glowRef?.current) {
        const glowPulse = 1 + 0.18 * Math.sin(t.current * 2.5);
        glowRef.current.scale.setScalar(1.25 * glowPulse);
        glowRef.current.material.opacity = 0.18 * (0.7 + 0.3 * colorPulse);
      }
      // Animate sparkles
      if (sparkRef?.current) {
        for (let i = 0; i < sparkRef.current.children.length; i++) {
          const mesh = sparkRef.current.children[i];
          const base = sparklePositions[i];
          const sparkleT = (t.current * 1.5 + i * 0.4) % 1;
          const r = 0.32 * size * (1.1 + 0.13 * Math.sin(t.current * 2 + i));
          const angle = (i / sparklePositions.length) * Math.PI * 2 + t.current * 0.5;
          mesh.position.x = position[0] + Math.cos(angle) * r;
          mesh.position.y = position[1] + 0.01 * Math.sin(t.current * 2.5 + i) + 0.01 * (Math.random() - 0.5);
          mesh.position.z = position[2] + Math.sin(angle) * r;
          mesh.scale.setScalar(0.07 * (0.7 + 0.3 * Math.sin(t.current * 3 + i)));
          mesh.material.opacity = 0.18 * (0.7 + 0.3 * Math.sin(t.current * 2.5 + i));
        }
      }
    });

    return (
      <group>
        {/* Soft glow under the rings */}
        <mesh ref={glowRef} position={[position[0], position[1] + 0.01 * size, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.38 * size, 48]} />
          <meshBasicMaterial color="#e0e7ff" transparent opacity={0.15} />
        </mesh>
        {/* Expanding, fading rings like sound pulses */}
        <mesh ref={ring1Ref} position={position} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.32 * size, 0.05 * size, 32, 96]} />
          <meshBasicMaterial color="#f3f3f3" transparent opacity={0.18} />
        </mesh>
        <mesh ref={ring2Ref} position={position} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.32 * size, 0.08 * size, 32, 96]} />
          <meshBasicMaterial color="#f3f3f3" transparent opacity={0.11} />
        </mesh>
        <mesh ref={ring3Ref} position={position} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.32 * size, 0.12 * size, 32, 96]} />
          <meshBasicMaterial color="#f3f3f3" transparent opacity={0.06} />
        </mesh>
        {/* Vertical conical wavefront above the sphere */}
        <mesh ref={wavefrontRef} position={[position[0], position[1] + 0.32 * size, position[2]]} rotation={[0, 0, 0]}>
          <coneGeometry args={[0.09 * size, 0.4 * size, 32, 1, true]} />
          <meshBasicMaterial color="#f3f3f3" transparent opacity={0.13} />
        </mesh>
        {/* Sparkles around the rings */}
        <group ref={sparkRef}>
          {sparklePositions.map((pos, i) => (
            <mesh key={i} position={[position[0] + pos[0], position[1] + pos[1], position[2] + pos[2]]}>
              <sphereGeometry args={[0.07 * size, 8, 8]} />
              <meshBasicMaterial color="#fffbe6" transparent opacity={0.18} />
            </mesh>
          ))}
        </group>
      </group>
    );
  }

  // 2D mode: SVG animated rings
  // svgCenter: [x, y] in SVG coordinates, svgScale: scale factor for radii
  // Animate using CSS keyframes or SVG SMIL (fallback to static if animate=false)
  // We'll use a simple expanding/fading ring with a soft glow
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!animate) return;
    let frame;
    let start = performance.now();
    function loop(now) {
      const t = ((now - start) / 1500) % 1; // 0 to 1 over 1.5s
      setPulse(t);
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  // Calculate radii and opacities
  const mainRadius = 19 * svgScale;
  const glowRadius = 28 * svgScale;
  const pulseRadius = mainRadius + pulse * 34 * svgScale;
  const pulseOpacity = 0.25 * (1 - pulse);
  const glowPulse = 0.7 + 0.3 * Math.sin(pulse * Math.PI * 2 * 0.8);
  const glowPulseRadius = glowRadius + glowPulse * 12 * svgScale;
  const glowOpacity = 0.12 * (1 - pulse) + 0.08 * glowPulse;

  return (
    <g>
      {/* Main pulsating ring */}
      <circle
        cx={svgCenter[0]}
        cy={svgCenter[1]}
        r={pulseRadius}
        fill="none"
        stroke={color}
        strokeWidth={6 * svgScale}
        opacity={pulseOpacity}
        style={{ transition: animate ? 'none' : 'opacity 0.2s' }}
      />
      {/* Subtle glow ring */}
      <circle
        cx={svgCenter[0]}
        cy={svgCenter[1]}
        r={glowPulseRadius}
        fill="none"
        stroke={color}
        strokeWidth={13 * svgScale}
        opacity={glowOpacity}
        style={{ filter: `blur(${2 * svgScale}px)` }}
      />
      {/* Faint vertical beam (as a soft ellipse) */}
      <ellipse
        cx={svgCenter[0]}
        cy={svgCenter[1]}
        rx={7 * svgScale}
        ry={35 * svgScale}
        fill={color}
        opacity={0.09}
        style={{ filter: `blur(${3 * svgScale}px)` }}
      />
    </g>
  );
}

export { PulsatingWave };

function Avatar({ position, color, isCurrentUser, onDrag, animate, displayName, highlight, dragging, setDragging, setControlsEnabled }) {
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);
  // Bounce effect state
  const [bounce, setBounce] = useState([0, 0, 0]);
  const bounceTimeout = useRef();
  // Drag state
  const dragActive = useRef(false);
  // Enhanced drag state
  const [isActuallyDragging, setIsActuallyDragging] = useState(false);
  const dragStartPos = useRef(null);
  const dragThreshold = 0.04; // Minimum movement to start drag
  const [dragShadow, setDragShadow] = useState(false);
  const [lerpedPos, setLerpedPos] = useState(position);
  // Billboard text
  const textRef = useRef();
  const { camera } = useThree();
  useFrame(() => {
    if (textRef.current) {
      textRef.current.quaternion.copy(camera.quaternion);
    }
    // Smoothly lerp to target position while dragging
    if (isActuallyDragging && meshRef.current) {
      const current = lerpedPos;
      const target = position;
      const lerped = current.map((v, i) => v + (target[i] - v) * 0.35);
      setLerpedPos(lerped);
      meshRef.current.position.set(...lerped);
    } else if (meshRef.current) {
      meshRef.current.position.set(...position);
      setLerpedPos(position);
    }
  });

  // Enhanced: handle pointer/touch events for both desktop and mobile
  const handlePointerDown = (e) => {
    if (!isCurrentUser) return;
    dragActive.current = true;
    dragStartPos.current = [e.point.x, e.point.y, e.point.z];
    setDragging && setDragging(true);
    setControlsEnabled && setControlsEnabled(false);
    setDragShadow(true);
    // Haptic feedback for mobile
    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(18);
    }
    e.stopPropagation();
  };
  const handlePointerUp = (e) => {
    if (!isCurrentUser) return;
    dragActive.current = false;
    setDragging && setDragging(false);
    setControlsEnabled && setControlsEnabled(true);
    setIsActuallyDragging(false);
    setDragShadow(false);
    // Spring-back if out of bounds
    const min = -3.5, max = 3.5;
    let [x, y, z] = position;
    let clamped = [
      Math.max(min, Math.min(max, x)),
      y,
      Math.max(min, Math.min(max, z)),
    ];
    if (clamped[0] !== x || clamped[2] !== z) {
      // Animate spring-back
      setLerpedPos(clamped);
      setTimeout(() => {
        onDrag(clamped);
      }, 120);
    }
    e.stopPropagation();
  };
  const handlePointerMove = (e) => {
    if (!isCurrentUser || !dragActive.current || !onDrag) return;
    let x = e.point.x, z = e.point.z;
    const min = -3.5, max = 3.5;
    let overshoot = [0, 0, 0];
    // Clamp and calculate overshoot for bounce effect
    if (x < min) { overshoot[0] = x - min; x = min; }
    if (x > max) { overshoot[0] = x - max; x = max; }
    if (z < min) { overshoot[2] = z - min; z = min; }
    if (z > max) { overshoot[2] = z - max; z = max; }
    // Enhanced: Add a subtle y-axis bounce if user tries to drag "up" or "down"
    let y = 0.3;
    if (e.point.y > 0.5) {
      overshoot[1] = Math.min(e.point.y - 0.5, 0.2);
      y += overshoot[1];
    } else if (e.point.y < 0.1) {
      overshoot[1] = Math.max(e.point.y - 0.1, -0.2);
      y += overshoot[1];
    }
    y = Math.max(y, 0.3);
    setBounce(overshoot);
    // Only start actual drag if moved enough
    if (!isActuallyDragging && dragStartPos.current) {
      const dx = x - dragStartPos.current[0];
      const dy = y - dragStartPos.current[1];
      const dz = z - dragStartPos.current[2];
      if (Math.sqrt(dx*dx + dy*dy + dz*dz) > dragThreshold) {
        setIsActuallyDragging(true);
      } else {
        return;
      }
    }
    onDrag([x + overshoot[0], y, z + overshoot[2]]);
    // Haptic feedback for mobile on edge
    if ((overshoot[0] !== 0 || overshoot[2] !== 0) && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(8);
    }
    e.stopPropagation();
  };

  // Enhanced visual feedback for hover/drag
  useEffect(() => {
    if (meshRef.current && meshRef.current.material) {
      // Change cursor for current user
      meshRef.current.cursor = isCurrentUser ? (dragging ? 'grabbing' : 'grab') : 'default';

      // Subtle highlight on hover or drag
      if (hovered || dragging) {
        meshRef.current.material.emissive = new THREE.Color(isCurrentUser ? '#6366f1' : '#fff');
        meshRef.current.material.emissiveIntensity = 0.25;
        meshRef.current.material.opacity = 0.92;
      } else {
        meshRef.current.material.emissive = new THREE.Color(0x000000);
        meshRef.current.material.emissiveIntensity = 0.0;
        meshRef.current.material.opacity = 1.0;
      }
      meshRef.current.material.needsUpdate = true;
    }
  }, [isCurrentUser, hovered, dragging]);

  // Enhanced: add visual feedback while dragging
  const dragScale = isActuallyDragging ? 1.18 : isCurrentUser ? 1.13 : 1;
  const dragGlow = isActuallyDragging || dragging || hovered;

  return (
    <group>
      {/* Floating sound wave effect always visible in 3D */}
      <PulsatingWave mode="3d" position={position} color={color} size={1.1} animate={true} />
      {/* Enhanced drag shadow for mobile/desktop */}
      {dragShadow && (
        <mesh position={[lerpedPos[0], 0.01, lerpedPos[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.36, 32]} />
          <meshBasicMaterial color="#000" transparent opacity={0.18} />
        </mesh>
      )}
      {/* Glow when dragging or hovered */}
      {dragGlow && (
        <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.38, 0.13, 16, 64]} />
          <meshBasicMaterial color={isCurrentUser ? '#6366f1' : '#fff'} transparent opacity={0.45} />
        </mesh>
      )}
      <mesh
        ref={meshRef}
        // Use lerped position for smooth dragging
        position={lerpedPos}
        castShadow
        receiveShadow
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerOver={e => { setHovered(true); e.stopPropagation(); }}
        onPointerOut={e => { setHovered(false); e.stopPropagation(); }}
        scale={[dragScale, dragScale, dragScale]}
      >
        <sphereGeometry args={[0.3, 64, 64]} />
        <meshPhysicalMaterial
          color="#fff"
          metalness={0.45}
          roughness={0.18}
          clearcoat={0.7}
          clearcoatRoughness={0.12}
          reflectivity={0.55}
          transmission={0.08}
          ior={1.4}
          thickness={0.18}
        />
        {/* Rim light/fresnel effect */}
        <mesh>
          <sphereGeometry args={[0.305, 64, 64]} />
          <meshBasicMaterial color="#6366f1" transparent opacity={0.13} />
        </mesh>
        {/* 3D initials embedded on the sphere, always facing the camera */}
        <Text
          ref={textRef}
          position={[0, 0, 0.31]}
          fontSize={0.13}
          color="#18181b"
          anchorX="center"
          anchorY="middle"
          outlineColor="#fff"
          outlineWidth={0.008}
          fontWeight={700}
          bevelEnabled
          bevelSize={0.008}
          bevelThickness={0.012}
        >
          {getInitials(displayName)}
        </Text>
      </mesh>
      {/* Highlight ring for recent movement */}
      {highlight && (
        <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.38, 0.06, 16, 64]} />
          <meshBasicMaterial color={isCurrentUser ? '#a5b4fc' : '#facc15'} transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

function RoomScene({ users, userPositions, setUserPosition, clientId, lastMoveTimes }) {
  // Track dragging state for current user
  const [dragging, setDragging] = useState(false);
  const [controlsEnabled, setControlsEnabled] = useState(true);
  const sunRef = useRef();

  return (
    <Canvas shadows camera={{ position: [0, 4, 6], fov: 50 }} style={{ width: '100%', height: '100%', borderRadius: '1rem' }}>
      {/* Minimalist deep background color */}
      <color attach="background" args={["#101014"]} />
      {/* Subtle vignette and gradient using Environment preset */}
      <Environment preset="city" background blur={0.8} />
      <EffectComposer>
        {/* Soft glow/halo under the grid */}
        <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[3.7, 64]} />
          <meshBasicMaterial color="#6366f1" opacity={0.09} transparent />
        </mesh>
        {/* God Rays effect from the sun disc */}
        {sunRef.current && (
          <GodRays sun={sunRef} samples={60} density={0.97} decay={0.97} weight={0.7} exposure={0.18} blur={true} />
        )}
      </EffectComposer>
      {/* Enhanced grid/floor */}
      <gridHelper args={[8, 16, '#23232a', '#23232a']} position={[0, 0.01, 0]} />
      {/* Center/origin marker */}
      <mesh position={[0, 0.011, 0]}>
        <circleGeometry args={[0.13, 32]} />
        <meshBasicMaterial color="#6366f1" opacity={0.7} transparent />
      </mesh>
      {/* Floor shadow plane */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#18181b" />
      </mesh>
      {/* Ambient and sun-like directional light for realistic shadow */}
      <ambientLight intensity={0.22} />
      <directionalLight
        position={[6, 12, -10]}
        intensity={1.45}
        color="#ffe9b0"
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-bias={-0.0002}
        shadow-radius={8}
      />
      {/* Avatars for all users */}
      <group>
        {users.map(u => (
          <Avatar
            key={cleanClientId(u.clientId)}
            position={userPositions[cleanClientId(u.clientId)] || [0, 0.3, 0]}
            color={stringToColor(cleanClientId(u.clientId) || u.displayName)}
            isCurrentUser={cleanClientId(u.clientId) === cleanClientId(clientId)}
            onDrag={pos => setUserPosition(cleanClientId(u.clientId), pos)}
            animate={cleanClientId(u.clientId) !== cleanClientId(clientId)}
            displayName={u.displayName}
            highlight={Date.now() - (lastMoveTimes[cleanClientId(u.clientId)] || 0) < 1500}
            dragging={dragging}
            setDragging={setDragging}
            setControlsEnabled={setControlsEnabled}
          />
        ))}
      </group>
      <OrbitControls enablePan enableZoom enableRotate enabled={controlsEnabled} />
    </Canvas>
  );
}

// Clamp utility for 3D
function clamp3D(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Clamp utility for 2D (used in to2D/to3D)
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function TwoDRoom({ users, userPositions, setUserPosition, clientId, lastMoveTimes }) {
  // Map 3D XZ positions to 2D SVG coordinates
  const minX = -3.5, maxX = 3.5, minZ = -3.5, maxZ = 3.5;
  // Drag state for current user
  const [dragging, setDragging] = React.useState(false);
  const svgRef = React.useRef();

  // Get parent size for full coverage
  const [size, setSize] = React.useState({ width: 320, height: 180 });

  React.useEffect(() => {
    function updateSize() {
      if (svgRef.current && svgRef.current.parentElement) {
        const rect = svgRef.current.parentElement.getBoundingClientRect();
        setSize({
          width: rect.width || 320,
          height: rect.height || 180,
        });
      }
    }
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const width = size.width;
  const height = size.height;

  // Convert 3D pos to 2D
  const to2D = ([x, , z]) => [
    clamp(((x - minX) / (maxX - minX)) * width, 20, width - 20),
    clamp(((z - minZ) / (maxZ - minZ)) * height, 20, height - 20)
  ];
  // Convert 2D to 3D
  const to3D = ([sx, sy]) => [
    ((clamp(sx, 20, width - 20) / width) * (maxX - minX)) + minX,
    0.3,
    ((clamp(sy, 20, height - 20) / height) * (maxZ - minZ)) + minZ
  ];

  // Handle drag for current user
  const handlePointerDown = (e) => {
    if (e.pointerType === 'touch') {
      e.target.setPointerCapture(e.pointerId);
    }
    setDragging(true);
  };
  const handlePointerUp = (e) => {
    setDragging(false);
    if (e.pointerType === 'touch') {
      e.target.releasePointerCapture(e.pointerId);
    }
  };
  const handlePointerMove = (e) => {
    if (!dragging) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    setUserPosition(clientId, to3D([sx, sy]));
  };

  // Draw grid lines every 40px
  const gridSpacing = 30;
  const gridLines = [];
  for (let x = gridSpacing; x < width; x += gridSpacing) {
    gridLines.push(
      <line key={`vx${x}`} x1={x} y1={0} x2={x} y2={height} stroke="#23232a" strokeWidth={1} strokeOpacity={0.6} />
    );
  }
  for (let y = gridSpacing; y < height; y += gridSpacing) {
    gridLines.push(
      <line key={`hz${y}`} x1={0} y1={y} x2={width} y2={y} stroke="#23232a" strokeWidth={1} strokeOpacity={0.6} />
    );
  }

  // Animated positions for all users (for smooth movement)
  const [displayedPositions, setDisplayedPositions] = React.useState(() => {
    const obj = {};
    users.forEach((u, i) => {
      obj[cleanClientId(u.clientId)] = userPositions[cleanClientId(u.clientId)] || [i * 1.5, 0.3, 0];
    });
    return obj;
  });

  // Animate all avatars' positions
  React.useEffect(() => {
    let frame;
    function animate() {
      setDisplayedPositions(prev => {
        const next = { ...prev };
        let changed = false;
        users.forEach((u, i) => {
          const cid = cleanClientId(u.clientId);
          const target = userPositions[cid] || [i * 1.5, 0.3, 0];
          const prevPos = prev[cid] || target;
          const lerped = prevPos.map((v, idx) => v + (target[idx] - v) * 0.22);
          if (!lerped.every((v, idx) => Math.abs(v - target[idx]) < 0.01)) changed = true;
          next[cid] = lerped.every((v, idx) => Math.abs(v - target[idx]) < 0.01) ? target : lerped;
        });
        return next;
      });
      frame = requestAnimationFrame(animate);
    }
    animate();
    return () => cancelAnimationFrame(frame);
  }, [users, userPositions]);

  // Zoom and pan state
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [panning, setPanning] = React.useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const lastPan = useRef({ x: 0, y: 0 });

  // Mouse wheel to zoom
  const handleWheel = (e) => {
    e.preventDefault();
    let newZoom = zoom - e.deltaY * 0.0015;
    newZoom = Math.max(0.5, Math.min(2.5, newZoom));
    setZoom(newZoom);
  };

  // Mouse/touch drag to pan
  const handlePointerDownPan = (e) => {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    setPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY };
    lastPan.current = { ...pan };
  };
  const handlePointerMovePan = (e) => {
    if (!panning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPan({ x: lastPan.current.x + dx, y: lastPan.current.y + dy });
  };
  const handlePointerUpPan = () => setPanning(false);

  // Reset zoom/pan
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Detect touch device
  const isTouchDevice = typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ background: '#121212', touchAction: 'none', width: '100%', height: '100%', display: 'block', borderRadius: '1rem', cursor: isTouchDevice && panning ? 'grabbing' : isTouchDevice ? 'grab' : 'default' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={isTouchDevice ? handleWheel : undefined}
        onPointerDown={isTouchDevice ? handlePointerDownPan : undefined}
        onPointerMoveCapture={isTouchDevice ? handlePointerMovePan : undefined}
        onPointerUpCapture={isTouchDevice ? handlePointerUpPan : undefined}
      >
        <g transform={`translate(${isTouchDevice ? pan.x : 0},${isTouchDevice ? pan.y : 0}) scale(${isTouchDevice ? zoom : 1})`}>
          {/* SVG defs for gradient and shadow */}
          <defs>
            <radialGradient id="avatarGradient" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#fff" stopOpacity="1" />
              <stop offset="100%" stopColor="#e5e5e7" stopOpacity="1" />
            </radialGradient>
            <filter id="avatarInnerShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.13" />
            </filter>
          </defs>
          {/* Grid mesh background */}
          <g>{gridLines}</g>
          {users.map((u, i) => {
            const cid = cleanClientId(u.clientId);
            const pos = userPositions[cid] || [i * 1.5, 0.3, 0];
            const displayedPos = displayedPositions[cid] || pos;
            const [cx, cy] = to2D(displayedPos);
            const isCurrentUser = cid === cleanClientId(clientId);
            const highlight = Date.now() - (lastMoveTimes[cid] || 0) < 1500;
            const color = stringToColor(cid || u.displayName);
            return (
              <g key={cid}>
                {/* Pulsating wave effect */}
                <PulsatingWave mode="2d" svgCenter={[cx, cy]} color={isCurrentUser ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.5)'} />
                {/* Drop shadow ellipse */}
                <ellipse
                  cx={cx}
                  cy={cy + 10}
                  rx={16}
                  ry={7}
                  fill="#000"
                  opacity={0.18}
                  style={{ filter: 'blur(2px)' }}
                />
                {/* Enhanced avatar circle */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={20}
                  fill="url(#avatarGradient)"
                  stroke="#27272a"
                  strokeWidth={2}
                  style={{ cursor: isCurrentUser ? 'grab' : 'default', outline: 'none' }}
                  filter="url(#avatarInnerShadow)"
                  onPointerDown={isCurrentUser ? handlePointerDown : undefined}
                />
                {/* Glossy highlight arc */}
                <path
                  d={`M${cx - 13},${cy - 7} Q${cx},${cy - 18} ${cx + 13},${cy - 7}`}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={3.5}
                  opacity={0.32}
                />
                {/* Initials inside avatar */}
                <text
                  x={cx}
                  y={cy + 6}
                  textAnchor="middle"
                  fill="#18181b"
                  fontSize={18}
                  fontWeight={700}
                  letterSpacing={1}
                  style={{
                    pointerEvents: 'none',
                    userSelect: 'none',
                    textShadow: '0 1px 4px #fff8',
                  }}
                >
                  {getInitials(u.displayName)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {/* Reset view button (only show on touch devices) */}
      {isTouchDevice && (
        <button
          onClick={handleResetView}
          style={{
            position: 'absolute',
            right: 12,
            bottom: 12,
            background: '#23232a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'pointer',
            opacity: 0.85,
          }}
        >
          Reset View
        </button>
      )}
    </div>
  );
}

function ThreeDRoom({ displayName, clientId, roomName = 'Room', users = [], socket, sessionId, mobile: mobileProp }) {
  const [is3D, setIs3D] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false); // For mobile legend toggle
  const [showHelp, setShowHelp] = useState(false); // For help modal
  // Responsive: allow explicit mobile prop or use window width
  const isMobile = typeof mobileProp === 'boolean' ? mobileProp : (typeof window !== 'undefined' && window.innerWidth < 768);
  // Store all user positions
  const [userPositions, setUserPositions] = useState(() => {
    const obj = {};
    users.forEach((u, i) => { obj[cleanClientId(u.clientId)] = [i * 1.5, 0.3, 0]; });
    return obj;
  });

  // Keep userPositions in sync with users list
  useEffect(() => {
    setUserPositions(prev => {
      const next = { ...prev };
      users.forEach((u, i) => {
        const cid = cleanClientId(u.clientId);
        if (!next[cid]) next[cid] = [i * 1.5, 0.3, 0];
      });
      // Remove positions for users who left
      Object.keys(next).forEach(cid => {
        if (!users.find(u => cleanClientId(u.clientId) === cid)) delete next[cid];
      });
      return next;
    });
  }, [users]);

  // Restore current user's position from localStorage on mount
  useEffect(() => {
    if (!sessionId || !clientId) return;
    const key = `avatarPos:${sessionId}:${clientId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        setUserPositions(prev => ({ ...prev, [cleanClientId(clientId)]: pos }));
      } catch {}
    }
  }, [sessionId, clientId]);

  // Save current user's position to localStorage on change
  useEffect(() => {
    if (!sessionId || !clientId) return;
    const key = `avatarPos:${sessionId}:${clientId}`;
    const pos = userPositions[cleanClientId(clientId)];
    if (pos) {
      localStorage.setItem(key, JSON.stringify(pos));
    }
  }, [userPositions, sessionId, clientId]);

  // Only allow current user to move their own avatar
  const setUserPosition = (cid, pos) => {
    if (cleanClientId(cid) !== cleanClientId(clientId)) return;
    // Clamp X and Z to grid bounds
    const min = -3.5, max = 3.5;
    const clamped = [
      clamp3D(pos[0], min, max),
      pos[1],
      clamp3D(pos[2], min, max)
    ];
    setUserPositions(prev => ({ ...prev, [cleanClientId(cid)]: clamped }));
    // Emit to server
    if (socket && sessionId) {
      socket.emit('avatar_position_update', {
        sessionId,
        clientId: cleanClientId(cid),
        position: clamped,
      });
    }
  };

  // Listen for position updates from other users
  useEffect(() => {
    if (!socket) return;
    const handler = ({ clientId: fromId, position }) => {
      if (cleanClientId(fromId) === cleanClientId(clientId)) return; // Ignore self
      setUserPositions(prev => ({ ...prev, [cleanClientId(fromId)]: position }));
    };
    socket.on('avatar_position_update', handler);
    return () => {
      socket.off('avatar_position_update', handler);
    };
  }, [socket, clientId]);

  // Track last movement time for each user
  const [lastMoveTimes, setLastMoveTimes] = useState({});

  // Update lastMoveTimes when a user moves
  useEffect(() => {
    // Listen for local and remote moves
    const updateMoveTime = (cid) => {
      setLastMoveTimes(prev => ({ ...prev, [cleanClientId(cid)]: Date.now() }));
    };
    // Local move
    const origSetUserPosition = setUserPosition;
    const wrappedSetUserPosition = (cid, pos) => {
      updateMoveTime(cid);
      origSetUserPosition(cid, pos);
    };
    // Patch setUserPosition for RoomScene
    setUserPositionRef.current = wrappedSetUserPosition;
    // Remote move (socket listener already updates position, so patch there too)
    if (!socket) return;
    const handler = ({ clientId: fromId, position }) => {
      if (cleanClientId(fromId) === cleanClientId(clientId)) return;
      updateMoveTime(fromId);
    };
    socket.on('avatar_position_update', handler);
    return () => {
      socket.off('avatar_position_update', handler);
    };
  }, [socket, clientId]);

  // Patch setUserPosition for RoomScene
  const setUserPositionRef = useRef(setUserPosition);
  useEffect(() => { setUserPositionRef.current = setUserPosition; }, [setUserPosition]);
  const wrappedSetUserPosition = (cid, pos) => {
    setLastMoveTimes(prev => ({ ...prev, [cleanClientId(cid)]: Date.now() }));
    setUserPositionRef.current(cid, pos);
  };

  // Responsive container style
  const containerStyle = isMobile
    ? { width: '100%', height: '60vh', minHeight: 320, background: '#18181b', color: '#fff', borderBottom: '1px solid #27272a', borderRight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }
    : { width: '100%', minWidth: 250, height: '100%', background: '#18181b', color: '#fff', borderRight: '1px solid #27272a', display: 'flex', flexDirection: 'column' };

  return (
    <div style={containerStyle} className={`relative ${isMobile ? 'rounded-t-xl overflow-hidden' : ''}`}>
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b border-black bg-black ${isMobile ? 'sticky top-0 z-20' : ''}`}
        style={{
          background: '#000',
          borderBottom: '1px solid #000',
          color: '#fff',
        }}
      >
        <div className="flex flex-col gap-0.5">
          <div className="font-bold text-base" style={{ color: '#fff' }}>Spatial</div>
          <div className="text-xs text-neutral-400 truncate max-w-[120px]" style={{ color: '#fff', opacity: 0.7 }}>
            Room: {roomName} | Users: {users.length}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            className="p-1 rounded transition-colors duration-200"
            style={{ background: '#000', color: '#fff' }}
            title="Reset View"
            onClick={() => setUserPosition(clientId, [0, 0.3, 0])}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transition: 'stroke 0.3s, transform 0.3s',
                willChange: 'stroke, transform',
              }}
              className="svg-animated"
            >
              <path d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.07-7.07l-1.41 1.41M6.34 17.66l-1.41 1.41M17.66 17.66l-1.41-1.41M6.34 6.34L4.93 4.93"/>
              <circle
                cx="12"
                cy="12"
                r="7"
                style={{
                  transition: 'r 0.3s',
                }}
              />
            </svg>
          </button>
          <button
            className="p-1 rounded transition-colors duration-200"
            style={{ background: '#000', color: '#fff' }}
            title="Help"
            onClick={() => setShowHelp(true)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transition: 'stroke 0.3s, transform 0.3s',
                willChange: 'stroke, transform',
              }}
              className="svg-animated"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                style={{
                  transition: 'r 0.3s',
                }}
              />
              <path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12" y2="17"/>
            </svg>
          </button>
          <button
            className="p-1 rounded transition-colors duration-200"
            style={{ background: '#000', color: '#fff' }}
            onClick={() => setIs3D(v => !v)}
            title="Toggle 2D/3D"
          >
            {is3D ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transition: 'stroke 0.3s, transform 0.3s',
                  willChange: 'stroke, transform',
                }}
                className="svg-animated"
              >
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="2"
                  style={{
                    transition: 'width 0.3s, height 0.3s',
                  }}
                />
                <path d="M3 9h18"/>
                <path d="M9 21V9"/>
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transition: 'stroke 0.3s, transform 0.3s',
                  willChange: 'stroke, transform',
                }}
                className="svg-animated"
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            )}
          </button>
          {isMobile && (
            <button
              className="p-1 rounded transition-colors duration-200"
              style={{ background: '#000', color: '#fff' }}
              onClick={() => setLegendOpen(v => !v)}
              title="Show/Hide Users"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transition: 'stroke 0.3s, transform 0.3s',
                  willChange: 'stroke, transform',
                }}
                className="svg-animated"
              >
                <circle
                  cx="12"
                  cy="7"
                  r="4"
                  style={{
                    transition: 'r 0.3s',
                  }}
                />
                <path d="M5.5 21a8.38 8.38 0 0 1 13 0"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      {/* 3D/2D Area */}
      <div className="flex-1 flex items-center justify-center p-1" style={{ minHeight: isMobile ? 220 : 180, height: isMobile ? 'calc(60vh - 48px)' : undefined, borderBottom: '1px solid #27272a', background: is3D ? 'linear-gradient(135deg, #18181b 80%, #27272a 100%)' : '#18181b' }}>
        {is3D ? (
          <div style={{ width: '100%', height: '100%' }}>
            <RoomScene users={users} userPositions={userPositions} setUserPosition={wrappedSetUserPosition} clientId={clientId} lastMoveTimes={lastMoveTimes} />
          </div>
        ) : (
          <TwoDRoom users={users} userPositions={userPositions} setUserPosition={wrappedSetUserPosition} clientId={clientId} lastMoveTimes={lastMoveTimes} />
        )}
      </div>
      {/* User List as Legend */}
      {(!isMobile || legendOpen) && (
        <div
          className="flex flex-wrap gap-3 p-2 border-t"
          style={{
            justifyContent: 'center',
            maxHeight: isMobile ? 120 : undefined,
            overflowY: isMobile ? 'auto' : undefined,
            background: '#000',
            borderTop: '1px solid #222',
          }}
        >
          {users.map(u => {
            const color = stringToColor(cleanClientId(u.clientId) || u.displayName);
            const isCurrent = cleanClientId(u.clientId) === cleanClientId(clientId);
            return (
              <div
                key={cleanClientId(u.clientId)}
                className="flex items-center gap-2 text-xs"
                style={{
                  minWidth: 80,
                  color: '#fff',
                  fontWeight: isCurrent ? 700 : 400,
                  background: isCurrent ? '#fff2' : 'transparent',
                  borderRadius: 8,
                  padding: '2px 6px',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: isCurrent ? '#fff' : '#111',
                    border: isCurrent ? '2px solid #fff' : '2px solid #444',
                    marginRight: 4,
                  }}
                />
                <span style={{ fontWeight: 700, color: isCurrent ? '#bbb' : '#fff' }}>
                  {getInitials(u.displayName)}
                </span>
                <span style={{ color: '#bbb', marginLeft: 2 }}>{u.displayName}</span>
              </div>
            );
          })}
        </div>
      )}
      {/* Help Modal for mobile */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowHelp(false)}>
          <div className="bg-neutral-900 rounded-xl p-5 max-w-xs w-full text-white relative" onClick={e => e.stopPropagation()}>
            <button className="absolute top-2 right-2 text-neutral-400 hover:text-white" onClick={() => setShowHelp(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div className="font-bold text-lg mb-2">Spatial Room Help</div>
            <ul className="list-disc pl-5 text-sm space-y-1">
              <li>Drag your avatar (the colored ball) to move in the space.</li>
              <li>Pinch or use two fingers to zoom and rotate the view.</li>
              <li>Tap the user icon to show/hide the user list.</li>
              <li>Tap the 2D/3D button to switch views.</li>
              <li>Tap the reset icon to center your avatar.</li>
            </ul>
            <div className="mt-3 text-xs text-neutral-400">Tap anywhere outside to close.</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThreeDRoom; 