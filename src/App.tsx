import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import Cube from 'cubejs';
import { RotateCcw, Play, Square, Shuffle, Camera } from 'lucide-react';
import CameraScanner from './CameraScanner';

const PALETTE = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];

const VIBRANT_COLORS: Record<string, string> = {
  'white': '#ffffff',
  'red': '#ff1a1a',
  'green': '#00e600',
  'yellow': '#ffe600',
  'orange': '#ff8000',
  'blue': '#0066ff',
  'black': '#1e293b'
};

const faceNormals = [
  new THREE.Vector3(1, 0, 0),  // 0: R
  new THREE.Vector3(-1, 0, 0), // 1: L
  new THREE.Vector3(0, 1, 0),  // 2: U
  new THREE.Vector3(0, -1, 0), // 3: D
  new THREE.Vector3(0, 0, 1),  // 4: F
  new THREE.Vector3(0, 0, -1)  // 5: B
];

const colorToFace: Record<string, string> = {
  'white': 'U',
  'red': 'R',
  'green': 'F',
  'yellow': 'D',
  'orange': 'L',
  'blue': 'B',
};

const moveDescriptions: Record<string, string> = {
  "U": "Upper face 90° clockwise",
  "U'": "Upper face 90° counter-clockwise",
  "U2": "Upper face 180°",
  "D": "Down face 90° clockwise",
  "D'": "Down face 90° counter-clockwise",
  "D2": "Down face 180°",
  "R": "Right face 90° clockwise",
  "R'": "Right face 90° counter-clockwise",
  "R2": "Right face 180°",
  "L": "Left face 90° clockwise",
  "L'": "Left face 90° counter-clockwise",
  "L2": "Left face 180°",
  "F": "Front face 90° clockwise",
  "F'": "Front face 90° counter-clockwise",
  "F2": "Front face 180°",
  "B": "Back face 90° clockwise",
  "B'": "Back face 90° counter-clockwise",
  "B2": "Back face 180°",
};

const roundHalf = (n: number) => Math.round(n * 2) / 2;
const roundVec = (v: THREE.Vector3) => new THREE.Vector3(roundHalf(v.x), roundHalf(v.y), roundHalf(v.z));

const FaceMarkers = ({ size }: { size: number }) => {
  const d = (size / 2) + 0.8;
  return (
    <group>
      <Text position={[0, 0, d]} fontSize={0.6} color="#0f172a" outlineWidth={0.04} outlineColor="#ffffff">F</Text>
      <Text position={[0, 0, -d]} fontSize={0.6} color="#0f172a" outlineWidth={0.04} outlineColor="#ffffff" rotation={[0, Math.PI, 0]}>B</Text>
      <Text position={[d, 0, 0]} fontSize={0.6} color="#0f172a" outlineWidth={0.04} outlineColor="#ffffff" rotation={[0, Math.PI / 2, 0]}>R</Text>
      <Text position={[-d, 0, 0]} fontSize={0.6} color="#0f172a" outlineWidth={0.04} outlineColor="#ffffff" rotation={[0, -Math.PI / 2, 0]}>L</Text>
      <Text position={[0, d, 0]} fontSize={0.6} color="#0f172a" outlineWidth={0.04} outlineColor="#ffffff" rotation={[-Math.PI / 2, 0, 0]}>U</Text>
      <Text position={[0, -d, 0]} fontSize={0.6} color="#0f172a" outlineWidth={0.04} outlineColor="#ffffff" rotation={[Math.PI / 2, 0, 0]}>D</Text>
    </group>
  );
};

type CubieData = {
  id: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  colors: string[];
};

function generateCubies(size: number): CubieData[] {
  const cubies: CubieData[] = [];
  let id = 0;
  const offset = (size - 1) / 2;
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        const px = x - offset;
        const py = y - offset;
        const pz = z - offset;
        cubies.push({
          id: id++,
          position: new THREE.Vector3(px, py, pz),
          quaternion: new THREE.Quaternion(),
          colors: [
            x === size - 1 ? 'red' : 'black',
            x === 0 ? 'orange' : 'black',
            y === size - 1 ? 'white' : 'black',
            y === 0 ? 'yellow' : 'black',
            z === size - 1 ? 'green' : 'black',
            z === 0 ? 'blue' : 'black',
          ]
        });
      }
    }
  }
  return cubies;
}

const getMoveAxes = (size: number) => {
  const maxCoord = (size - 1) / 2;
  const threshold = maxCoord - 0.1;
  return {
    U: { axis: new THREE.Vector3(0, 1, 0), angle: -Math.PI / 2, filter: (p: THREE.Vector3) => p.y > threshold },
    D: { axis: new THREE.Vector3(0, 1, 0), angle: Math.PI / 2, filter: (p: THREE.Vector3) => p.y < -threshold },
    R: { axis: new THREE.Vector3(1, 0, 0), angle: -Math.PI / 2, filter: (p: THREE.Vector3) => p.x > threshold },
    L: { axis: new THREE.Vector3(1, 0, 0), angle: Math.PI / 2, filter: (p: THREE.Vector3) => p.x < -threshold },
    F: { axis: new THREE.Vector3(0, 0, 1), angle: -Math.PI / 2, filter: (p: THREE.Vector3) => p.z > threshold },
    B: { axis: new THREE.Vector3(0, 0, 1), angle: Math.PI / 2, filter: (p: THREE.Vector3) => p.z < -threshold },
  } as const;
};

function getCubeString(cubies: CubieData[]) {
  const stickers: { color: string, worldNormal: THREE.Vector3, worldPos: THREE.Vector3 }[] = [];
  cubies.forEach(cubie => {
    cubie.colors.forEach((color, faceIndex) => {
      if (color === 'black') return;
      const localNormal = faceNormals[faceIndex].clone();
      const worldNormal = localNormal.clone().applyQuaternion(cubie.quaternion).round();
      const worldPos = cubie.position.clone();
      stickers.push({ color, worldNormal, worldPos });
    });
  });

  const cmp = (a: number, b: number) => roundHalf(a) - roundHalf(b);

  const getFaceStickers = (nx: number, ny: number, nz: number, sortFn: (a: any, b: any) => number) => {
    const face = stickers.filter(s => s.worldNormal.x === nx && s.worldNormal.y === ny && s.worldNormal.z === nz);
    face.sort(sortFn);
    return face.map(s => colorToFace[s.color]).join('');
  };

  const U = getFaceStickers(0, 1, 0, (a, b) => cmp(a.worldPos.z, b.worldPos.z) || cmp(a.worldPos.x, b.worldPos.x));
  const R = getFaceStickers(1, 0, 0, (a, b) => cmp(b.worldPos.y, a.worldPos.y) || cmp(b.worldPos.z, a.worldPos.z));
  const F = getFaceStickers(0, 0, 1, (a, b) => cmp(b.worldPos.y, a.worldPos.y) || cmp(a.worldPos.x, b.worldPos.x));
  const D = getFaceStickers(0, -1, 0, (a, b) => cmp(b.worldPos.z, a.worldPos.z) || cmp(a.worldPos.x, b.worldPos.x));
  const L = getFaceStickers(-1, 0, 0, (a, b) => cmp(b.worldPos.y, a.worldPos.y) || cmp(a.worldPos.z, b.worldPos.z));
  const B = getFaceStickers(0, 0, -1, (a, b) => cmp(b.worldPos.y, a.worldPos.y) || cmp(b.worldPos.x, a.worldPos.x));

  return U + R + F + D + L + B;
}

const RubiksCube = ({ size, cubies, setCubies, selectedColor, isAnimating, animationRef, onAnimationComplete }: any) => {
  const cubieRefs = useRef<(THREE.Mesh | null)[]>([]);
  const moveAxes = useMemo(() => getMoveAxes(size), [size]);

  useFrame((state, delta) => {
    if (animationRef.current.active) {
      animationRef.current.progress += delta * 4; // speed
      if (animationRef.current.progress >= 1) {
        animationRef.current.progress = 1;
      }
      
      const moveStr = animationRef.current.move;
      const baseMove = moveStr[0] as keyof typeof moveAxes;
      const modifier = moveStr[1];
      const multiplier = modifier === "'" ? -1 : modifier === '2' ? 2 : 1;
      const { axis, angle, filter } = moveAxes[baseMove];
      const totalAngle = angle * multiplier * animationRef.current.direction;
      const currentAngle = totalAngle * animationRef.current.progress;

      const rotQuat = new THREE.Quaternion().setFromAxisAngle(axis, currentAngle);

      cubies.forEach((cubie: CubieData, i: number) => {
        if (filter(cubie.position)) {
          const mesh = cubieRefs.current[i];
          if (mesh) {
            const pos = cubie.position.clone().applyQuaternion(rotQuat);
            mesh.position.copy(pos);
            const quat = rotQuat.clone().multiply(cubie.quaternion);
            mesh.quaternion.copy(quat);
          }
        }
      });

      if (animationRef.current.progress === 1) {
        const newCubies = [...cubies];
        cubies.forEach((cubie: CubieData, i: number) => {
          if (filter(cubie.position)) {
            const finalQuat = new THREE.Quaternion().setFromAxisAngle(axis, totalAngle);
            newCubies[i] = { ...cubie };
            newCubies[i].position = roundVec(cubie.position.clone().applyQuaternion(finalQuat));
            newCubies[i].quaternion = finalQuat.clone().multiply(cubie.quaternion).normalize();
          }
        });
        setCubies(newCubies);
        
        animationRef.current.active = false;
        onAnimationComplete();
      }
    }
  });

  const handleFaceClick = (index: number, faceIndex: number) => {
    if (isAnimating) return;
    const newCubies = [...cubies];
    const newColors = [...newCubies[index].colors];
    if (newColors[faceIndex] !== 'black') {
      newColors[faceIndex] = selectedColor;
      newCubies[index] = { ...newCubies[index], colors: newColors };
      setCubies(newCubies);
    }
  };

  return (
    <group>
      {cubies.map((cubie: CubieData, i: number) => (
        <mesh 
          key={cubie.id}
          ref={el => cubieRefs.current[i] = el}
          position={cubie.position}
          quaternion={cubie.quaternion}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (e.faceIndex !== undefined) {
              const faceIndex = Math.floor(e.faceIndex / 2);
              handleFaceClick(i, faceIndex);
            }
          }}
        >
          <boxGeometry args={[0.95, 0.95, 0.95]} />
          {cubie.colors.map((color, idx) => (
            <meshStandardMaterial key={idx} attach={`material-${idx}`} color={VIBRANT_COLORS[color] || color} />
          ))}
        </mesh>
      ))}
    </group>
  );
};

export default function App() {
  const [size, setSize] = useState(3);
  const [cubies, setCubies] = useState<CubieData[]>([]);
  const [selectedColor, setSelectedColor] = useState('white');
  const [isAnimating, setIsAnimating] = useState(false);
  const [solution, setSolution] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  const [solverReady, setSolverReady] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const animationRef = useRef({ active: false, move: '', progress: 0, direction: 1 });

  useEffect(() => {
    Cube.initSolver();
    setSolverReady(true);
    
    const savedSize = localStorage.getItem('rubiks-size');
    const savedCubies = localStorage.getItem('rubiks-cubies');
    
    if (savedSize && savedCubies) {
      try {
        const parsedSize = parseInt(savedSize, 10);
        const parsedCubies = JSON.parse(savedCubies);
        let valid = true;
        const reconstructedCubies = parsedCubies.map((c: any) => {
          let qx, qy, qz, qw;
          if (Array.isArray(c.quaternion)) {
             [qx, qy, qz, qw] = c.quaternion;
          } else {
             qx = c.quaternion?._x ?? c.quaternion?.x;
             qy = c.quaternion?._y ?? c.quaternion?.y;
             qz = c.quaternion?._z ?? c.quaternion?.z;
             qw = c.quaternion?._w ?? c.quaternion?.w;
          }
          if (qx === undefined || qy === undefined || qz === undefined || qw === undefined) {
            valid = false;
          }
          let px, py, pz;
          if (Array.isArray(c.position)) {
             [px, py, pz] = c.position;
          } else {
             px = c.position?.x;
             py = c.position?.y;
             pz = c.position?.z;
          }
          return {
            ...c,
            position: new THREE.Vector3(px, py, pz),
            quaternion: new THREE.Quaternion(qx, qy, qz, qw)
          };
        });
        if (valid) {
          setSize(parsedSize);
          setCubies(reconstructedCubies);
        } else {
          setCubies(generateCubies(parsedSize || 3));
        }
      } catch (e) {
        console.error("Failed to load cube state", e);
        setCubies(generateCubies(3));
      }
    } else {
      setCubies(generateCubies(size));
    }
  }, []);

  useEffect(() => {
    if (cubies.length > 0) {
      localStorage.setItem('rubiks-size', size.toString());
      const serializedCubies = cubies.map(c => ({
        id: c.id,
        position: c.position.toArray(),
        quaternion: c.quaternion.toArray(),
        colors: c.colors
      }));
      localStorage.setItem('rubiks-cubies', JSON.stringify(serializedCubies));
    }
  }, [size, cubies]);

  useEffect(() => {
    if (isPlaying && !isAnimating && currentStep < solution.length) {
      handleNext();
    } else if (isPlaying && currentStep >= solution.length) {
      setIsPlaying(false);
    }
  }, [isPlaying, isAnimating, currentStep, solution.length]);

  const handleSizeChange = (newSize: number) => {
    if (isAnimating || isPlaying) return;
    setSize(newSize);
    setCubies(generateCubies(newSize));
    setSolution([]);
    setCurrentStep(0);
    setError('');
  };

  const handleSolve = () => {
    if (size !== 3) {
      setError('Solving is currently only supported for 3x3 cubes.');
      return;
    }
    
    try {
      const cubeString = getCubeString(cubies);
      if (cubeString.length !== 54) {
        throw new Error('Invalid cube state');
      }
      
      const counts: Record<string, number> = {};
      for (const char of cubeString) {
        counts[char] = (counts[char] || 0) + 1;
      }
      
      const expectedChars = ['U', 'R', 'F', 'D', 'L', 'B'];
      for (const char of expectedChars) {
        if (counts[char] !== 9) {
          throw new Error(`Invalid colors: each color must appear exactly 9 times. Check your cube.`);
        }
      }

      const cube = Cube.fromString(cubeString);
      const solveString = cube.solve();
      
      if (!solveString) {
        setSolution([]);
        setCurrentStep(0);
        setError('Cube is already solved!');
        return;
      }

      const moves = solveString.split(' ');
      setSolution(moves);
      setCurrentStep(0);
      setIsPlaying(true);
      setError('');

    } catch (err: any) {
      setError(err.message || 'Failed to solve cube. Please check the colors.');
    }
  };

  const handleScramble = () => {
    if (size !== 3) {
      setError('Scrambling is currently only supported for 3x3 cubes.');
      return;
    }
    
    try {
      const scrambleString = Cube.scramble();
      const moves = scrambleString.split(' ');
      
      setSolution(moves);
      setCurrentStep(0);
      setIsPlaying(true);
      setError('');
    } catch (err: any) {
      setError('Failed to scramble cube.');
    }
  };

  const handleReset = () => {
    if (isAnimating || isPlaying) return;
    setCubies(generateCubies(size));
    setSolution([]);
    setCurrentStep(0);
    setError('');
  };

  const handleNext = () => {
    if (isAnimating || currentStep >= solution.length) return;
    setIsAnimating(true);
    animationRef.current = {
      active: true,
      move: solution[currentStep],
      progress: 0,
      direction: 1
    };
    setCurrentStep(prev => prev + 1);
  };

  const handlePrev = () => {
    if (isAnimating || currentStep <= 0) return;
    setIsAnimating(true);
    animationRef.current = {
      active: true,
      move: solution[currentStep - 1],
      progress: 0,
      direction: -1
    };
    setCurrentStep(prev => prev - 1);
  };

  const handleApplyScannedColors = (faceName: string, colors2D: string[][]) => {
    const offset = (size - 1) / 2;
    const targetDir = new THREE.Vector3();
    switch (faceName) {
      case 'R': targetDir.set(1, 0, 0); break;
      case 'L': targetDir.set(-1, 0, 0); break;
      case 'U': targetDir.set(0, 1, 0); break;
      case 'D': targetDir.set(0, -1, 0); break;
      case 'F': targetDir.set(0, 0, 1); break;
      case 'B': targetDir.set(0, 0, -1); break;
    }

    const newCubies = [...cubies];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let x = 0, y = 0, z = 0;
        if (faceName === 'F') { x = c - offset; y = (size - 1 - r) - offset; z = offset; }
        else if (faceName === 'B') { x = (size - 1 - c) - offset; y = (size - 1 - r) - offset; z = -offset; }
        else if (faceName === 'R') { x = offset; y = (size - 1 - r) - offset; z = (size - 1 - c) - offset; }
        else if (faceName === 'L') { x = -offset; y = (size - 1 - r) - offset; z = c - offset; }
        else if (faceName === 'U') { x = c - offset; y = offset; z = r - offset; }
        else if (faceName === 'D') { x = c - offset; y = -offset; z = (size - 1 - r) - offset; }

        const pos = new THREE.Vector3(x, y, z);
        const color = colors2D[r][c];

        const cubieIndex = newCubies.findIndex(cubie => pos.distanceTo(cubie.position) < 0.1);

        if (cubieIndex !== -1) {
          const cubie = newCubies[cubieIndex];
          let targetFaceIndex = -1;
          for (let i = 0; i < 6; i++) {
            const rotatedNormal = faceNormals[i].clone().applyQuaternion(cubie.quaternion).round();
            if (rotatedNormal.equals(targetDir)) {
              targetFaceIndex = i;
              break;
            }
          }

          if (targetFaceIndex !== -1) {
            const newColors = [...cubie.colors];
            newColors[targetFaceIndex] = color;
            newCubies[cubieIndex] = { ...cubie, colors: newColors };
          }
        }
      }
    }
    setCubies(newCubies);
    setShowScanner(false);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#f8fafc] text-[#0f172a] font-['Helvetica_Neue',Arial,sans-serif] overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-[#e2e8f0] bg-[#ffffff] flex items-center px-10 justify-between shrink-0">
        <div className="font-extrabold text-xl tracking-tight flex items-center gap-2.5">
          <div className="w-6 h-6 bg-[#2563eb] rounded"></div>
          CUBE ENGINE 3.0
        </div>
        <div className="flex gap-6 text-sm font-medium text-[#64748b]">
          <span>Documentation</span>
          <span>Settings</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-[280px_1fr_280px] gap-[1px] bg-[#e2e8f0] min-h-0">
        {/* Sidebar */}
        <div className="bg-[#ffffff] p-8 flex flex-col gap-8 overflow-y-auto">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748b] mb-4">Configuration</h3>
            <div className="grid grid-cols-2 gap-2">
              {[2, 3, 4].map(s => (
                <button
                  key={s}
                  onClick={() => handleSizeChange(s)}
                  disabled={isAnimating || isPlaying}
                  className={`border border-[#e2e8f0] p-2.5 rounded-md text-sm font-semibold cursor-pointer transition-colors ${
                    size === s 
                      ? 'bg-[#2563eb] text-white border-[#2563eb]' 
                      : 'bg-transparent text-[#0f172a] hover:bg-[#f8fafc] disabled:opacity-50'
                  }`}
                >
                  {s}x{s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748b]">Color Input</h3>
              <button 
                onClick={() => setShowScanner(true)}
                disabled={isAnimating || isPlaying}
                className="flex items-center gap-1 text-xs font-bold text-[#2563eb] hover:text-[#1d4ed8] disabled:opacity-50 cursor-pointer"
              >
                <Camera size={14} />
                Scan Face
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {PALETTE.map(color => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-full aspect-square rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedColor === color ? 'border-[#0f172a]' : 'border-[#e2e8f0] hover:border-[#64748b]'
                  }`}
                  style={{ backgroundColor: VIBRANT_COLORS[color] || color }}
                  title={color}
                />
              ))}
            </div>
          </div>

          <div className="mt-auto bg-[#f8fafc] p-4 rounded-xl">
            <p className="text-xs text-[#64748b] leading-relaxed">
              <strong>Instructions:</strong> Select a color from the palette, then click on the cube faces to map your physical cube's current state.
            </p>
          </div>

          <div className="space-y-3">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
                {error}
              </div>
            )}
            
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                disabled={isAnimating || isPlaying}
                className="flex-1 flex items-center justify-center gap-2 p-2.5 border border-[#e2e8f0] bg-transparent rounded-md text-sm font-semibold cursor-pointer hover:bg-[#f8fafc] transition-colors disabled:opacity-50"
              >
                <RotateCcw size={16} />
                Reset
              </button>
              <button
                onClick={handleScramble}
                disabled={isAnimating || isPlaying || !solverReady || size !== 3}
                className="flex-1 flex items-center justify-center gap-2 p-2.5 border border-[#e2e8f0] bg-transparent rounded-md text-sm font-semibold cursor-pointer hover:bg-[#f8fafc] transition-colors disabled:opacity-50"
              >
                <Shuffle size={16} />
                Scramble
              </button>
            </div>
          </div>
        </div>

        {/* Visualizer */}
        <div className="bg-[#f8fafc] relative flex items-center justify-center">
          <Canvas camera={{ position: [5, 5, 5], fov: 45 }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[10, 10, 10]} intensity={1} />
            <directionalLight position={[-10, -10, -10]} intensity={0.5} />
            <RubiksCube 
              size={size}
              cubies={cubies} 
              setCubies={setCubies} 
              selectedColor={selectedColor}
              isAnimating={isAnimating}
              animationRef={animationRef}
              onAnimationComplete={() => setIsAnimating(false)}
            />
            <FaceMarkers size={size} />
            <OrbitControls enablePan={false} minDistance={4} maxDistance={15} />
          </Canvas>

          <button
            onClick={handleSolve}
            disabled={isAnimating || isPlaying || !solverReady || size !== 3}
            className="absolute bottom-10 px-12 py-4 bg-[#0f172a] text-white border-none rounded-full font-bold text-base tracking-wide shadow-[0_10px_25px_rgba(0,0,0,0.1)] cursor-pointer hover:bg-[#1e293b] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isPlaying ? <Square size={18} className="animate-pulse" /> : <Play size={18} />}
            {isPlaying ? 'SOLVING...' : 'RUN SOLVER'}
          </button>
        </div>

        {/* Steps Panel */}
        <div className="bg-[#ffffff] p-8 flex flex-col overflow-hidden">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748b] mb-4 shrink-0">Solution Path</h3>
          
          {solution.length > 0 && (
            <div className="flex gap-2 mb-4 shrink-0">
              <button 
                onClick={handlePrev} 
                disabled={isAnimating || currentStep <= 0}
                className="flex-1 p-2 border border-[#e2e8f0] rounded-md text-sm font-semibold hover:bg-[#f8fafc] disabled:opacity-50"
              >
                Previous
              </button>
              <button 
                onClick={() => setIsPlaying(!isPlaying)} 
                disabled={isAnimating || currentStep >= solution.length}
                className="flex-1 p-2 bg-[#2563eb] text-white rounded-md text-sm font-semibold hover:bg-[#1d4ed8] disabled:opacity-50"
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button 
                onClick={handleNext} 
                disabled={isAnimating || currentStep >= solution.length}
                className="flex-1 p-2 border border-[#e2e8f0] rounded-md text-sm font-semibold hover:bg-[#f8fafc] disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}

          <div className="flex flex-col overflow-y-auto flex-1">
            {solution.length === 0 ? (
              <div className="text-sm text-[#64748b] py-4">No solution yet.</div>
            ) : (
              solution.map((move, i) => {
                const isCurrent = i === currentStep - 1;
                const isPast = i < currentStep - 1;
                const isNext = i === currentStep;
                
                return (
                  <div key={i} className={`flex items-center gap-4 py-4 border-b border-[#e2e8f0] ${isPast ? 'opacity-40' : ''}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isCurrent ? 'bg-[#2563eb] text-white' : isNext ? 'bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0]' : 'bg-[#f8fafc] text-[#64748b]'}`}>
                      {i + 1}
                    </div>
                    <div>
                      <div className="font-mono text-lg font-bold text-[#2563eb]">{move}</div>
                      <div className="text-[13px] text-[#64748b]">{moveDescriptions[move] || `Move ${move}`}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* Status Bar */}
      <div className="h-8 bg-[#ffffff] border-t border-[#e2e8f0] flex items-center px-6 text-[11px] text-[#64748b] gap-5 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isAnimating || isPlaying ? 'bg-[#eab308]' : 'bg-[#10b981]'}`}></div>
          {isAnimating || isPlaying ? 'Solving in progress' : 'System Ready'}
        </div>
        <div>Algorithm: Kociemba v4</div>
        {solution.length > 0 && <div>Complexity: {solution.length} Moves</div>}
        <div className="ml-auto">v3.2.1-stable</div>
      </div>

      {showScanner && (
        <CameraScanner 
          size={size} 
          onApply={handleApplyScannedColors} 
          onClose={() => setShowScanner(false)} 
        />
      )}
    </div>
  );
}
