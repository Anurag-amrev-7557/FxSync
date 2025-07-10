import React, { useState, useRef, useEffect } from 'react';
// Add Three.js and react-three-fiber imports
import { Canvas, useFrame } from '@react-three/fiber';
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

function PulsatingWave({ position, color = '#6366f1', mode = '3d', size = 1, svgCenter = [0, 0], svgScale = 1, animate = true }) {
  // 3D mode: original implementation
  if (mode === '3d') {
    const meshRef = useRef();
    const t = useRef(0);
    const glowRef = useRef();

    useFrame((_, delta) => {
      if (!animate) return;
      t.current += delta;
      const pulse = (t.current % 1.5) / 1.5; // 0 to 1

      // Main wave pulse
      if (meshRef.current) {
        meshRef.current.scale.setScalar(size * (1 + pulse * 1.8));
        meshRef.current.material.opacity = 0.25 * (1 - pulse);
        meshRef.current.material.color.set(color);
      }

      // Glow pulse (slower, softer)
      if (glowRef.current) {
        const glowPulse = 0.7 + 0.3 * Math.sin(t.current * 1.2);
        glowRef.current.scale.setScalar(size * (1.7 + glowPulse * 0.7));
        glowRef.current.material.opacity = 0.12 * (1 - pulse) + 0.08 * glowPulse;
        glowRef.current.material.color.set(color);
      }
    });

    return (
      <group>
        {/* Main pulsating torus */}
        <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.38 * size, 0.06 * size, 16, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.25} />
        </mesh>
        {/* Subtle glow ring */}
        <mesh ref={glowRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.38 * size, 0.13 * size, 16, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.12} />
        </mesh>
        {/* Faint vertical beam */}
        <mesh position={[position[0], position[1] + 0.01 * size, position[2]]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[0.07 * size, 0.07 * size, 0.7 * size, 24, 1, true]} />
          <meshBasicMaterial color={color} transparent opacity={0.09} />
        </mesh>
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

  // Handle pointer events
  const handlePointerDown = (e) => {
    if (!isCurrentUser) return;
    dragActive.current = true;
    setDragging && setDragging(true);
    setControlsEnabled && setControlsEnabled(false);
    e.stopPropagation();
  };
  const handlePointerUp = (e) => {
    if (!isCurrentUser) return;
    dragActive.current = false;
    setDragging && setDragging(false);
    setControlsEnabled && setControlsEnabled(true);
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

    // Enhanced: Add a subtle y-axis bounce if user tries to drag "up" or "down" (simulate a little vertical feedback)
    let y = 0.3;
    if (e.point.y > 0.5) {
      overshoot[1] = Math.min(e.point.y - 0.5, 0.2);
      y += overshoot[1];
    } else if (e.point.y < 0.1) {
      overshoot[1] = Math.max(e.point.y - 0.1, -0.2);
      y += overshoot[1];
    }
    // Clamp y so the sphere never goes below the floor
    y = Math.max(y, 0.3);

    setBounce(overshoot);

    // Enhanced: Add a little "magnetic snap" to grid if close to grid lines
    const snapThreshold = 0.18;
    const gridSpacing = 1.0;
    const snapToGrid = (val) => {
      const mod = val % gridSpacing;
      if (Math.abs(mod) < snapThreshold) return val - mod;
      if (Math.abs(mod - gridSpacing) < snapThreshold) return val + (gridSpacing - mod);
      return val;
    };
    let snappedX = snapToGrid(x);
    let snappedZ = snapToGrid(z);

    // Only snap if not overshooting
    if (overshoot[0] === 0) x = snappedX;
    if (overshoot[2] === 0) z = snappedZ;

    onDrag([x + overshoot[0], y, z + overshoot[2]]);

    // Enhanced: Make bounce duration depend on overshoot magnitude for a more natural feel
    if (overshoot.some(v => v !== 0)) {
      clearTimeout(bounceTimeout.current);
      const bounceDuration = 100 + 80 * Math.max(Math.abs(overshoot[0]), Math.abs(overshoot[2]), Math.abs(overshoot[1]));
      bounceTimeout.current = setTimeout(() => setBounce([0, 0, 0]), bounceDuration);
    }

    // Enhanced: Play a subtle sound or haptic feedback on edge hit (if available)
    if ((overshoot[0] !== 0 || overshoot[2] !== 0) && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(10);
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

  return (
    <group>
      {/* Glow when dragging or hovered */}
      {(dragging || hovered) && (
        <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.38, 0.09, 16, 64]} />
          <meshBasicMaterial color={isCurrentUser ? '#6366f1' : '#fff'} transparent opacity={0.35} />
        </mesh>
      )}
      <mesh
        ref={meshRef}
        position={[position[0] + bounce[0], position[1], position[2] + bounce[2]]}
        castShadow
        receiveShadow
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerOver={e => { setHovered(true); e.stopPropagation(); }}
        onPointerOut={e => { setHovered(false); e.stopPropagation(); }}
        scale={isCurrentUser ? [1.3, 1.3, 1.3] : [1, 1, 1]}
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
        {/* 3D initials embedded on the sphere */}
        <Text
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
                <PulsatingWave mode="2d" svgCenter={[cx, cy]} color={isCurrentUser ? '#6366f1' : '#27272a'} />
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
      <div className={`flex items-center justify-between px-3 py-2 border-b border-neutral-800 bg-neutral-950/80 ${isMobile ? 'sticky top-0 z-20' : ''}`}>
        <div className="flex flex-col gap-0.5">
          <div className="font-bold text-base">Spatial</div>
          <div className="text-xs text-neutral-400 truncate max-w-[120px]">Room: {roomName} | Users: {users.length}</div>
        </div>
        <div className="flex gap-1">
          <button className="p-1 rounded bg-neutral-800 hover:bg-neutral-700" title="Reset View" onClick={() => setUserPosition(clientId, [0, 0.3, 0])}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.07-7.07l-1.41 1.41M6.34 17.66l-1.41 1.41M17.66 17.66l-1.41-1.41M6.34 6.34L4.93 4.93"/><circle cx="12" cy="12" r="7"/></svg>
          </button>
          <button className="p-1 rounded bg-neutral-800 hover:bg-neutral-700" title="Help" onClick={() => setShowHelp(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12" y2="17"/></svg>
          </button>
          <button className="p-1 rounded bg-neutral-800 hover:bg-neutral-700" onClick={() => setIs3D(v => !v)} title="Toggle 2D/3D">
            {is3D ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            )}
          </button>
          {isMobile && (
            <button className="p-1 rounded bg-neutral-800 hover:bg-neutral-700" onClick={() => setLegendOpen(v => !v)} title="Show/Hide Users">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg>
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
        <div className="flex flex-wrap gap-3 p-2 border-t border-neutral-800 bg-neutral-950/80" style={{ justifyContent: 'center', maxHeight: isMobile ? 120 : undefined, overflowY: isMobile ? 'auto' : undefined }}>
          {users.map(u => {
            const color = stringToColor(cleanClientId(u.clientId) || u.displayName);
            return (
              <div key={cleanClientId(u.clientId)} className="flex items-center gap-2 text-xs text-neutral-300" style={{ minWidth: 80 }}>
                <span style={{
                  display: 'inline-block',
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#fff',
                  border: cleanClientId(u.clientId) === cleanClientId(clientId) ? '2px solid #6366f1' : '2px solid #27272a',
                  marginRight: 4,
                }} />
                <span style={{ fontWeight: 700, color: '#18181b' }}>{getInitials(u.displayName)}</span>
                <span style={{ color: '#a3a3a3', marginLeft: 2 }}>{u.displayName}</span>
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