import React, { useEffect, useRef, useState } from 'react';
import { X, Camera as CameraIcon, RotateCcw } from 'lucide-react';

const BASE_COLORS = {
  'white': [255, 255, 255],
  'red': [255, 26, 26],
  'green': [0, 230, 0],
  'yellow': [255, 230, 0],
  'orange': [255, 128, 0],
  'blue': [0, 102, 255]
};

const VIBRANT_COLORS: Record<string, string> = {
  'white': '#ffffff',
  'red': '#ff1a1a',
  'green': '#00e600',
  'yellow': '#ffe600',
  'orange': '#ff8000',
  'blue': '#0066ff',
};

const PALETTE = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];

function getClosestColor(r: number, g: number, b: number) {
  let minDistance = Infinity;
  let closest = 'white';
  for (const [name, rgb] of Object.entries(BASE_COLORS)) {
    const dist = Math.sqrt((r-rgb[0])**2 + (g-rgb[1])**2 + (b-rgb[2])**2);
    if (dist < minDistance) {
      minDistance = dist;
      closest = name;
    }
  }
  return closest;
}

export default function CameraScanner({ size, onApply, onClose }: any) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedColors, setCapturedColors] = useState<string[][] | null>(null);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => {
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      })
      .catch(err => console.error("Camera error:", err));

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const intrinsicSize = Math.min(canvas.width, canvas.height) * 0.8;
    const startX = (canvas.width - intrinsicSize) / 2;
    const startY = (canvas.height - intrinsicSize) / 2;
    const cellSize = intrinsicSize / size;

    const colors: string[][] = [];
    for (let r = 0; r < size; r++) {
      const row: string[] = [];
      for (let c = 0; c < size; c++) {
        const centerX = startX + c * cellSize + cellSize / 2;
        const centerY = startY + r * cellSize + cellSize / 2;
        
        // Sample 5x5 area
        const radius = 5;
        const data = ctx.getImageData(centerX - radius, centerY - radius, radius * 2, radius * 2).data;
        let sumR = 0, sumG = 0, sumB = 0;
        const count = (radius * 2) ** 2;
        for (let i = 0; i < data.length; i += 4) {
          sumR += data[i];
          sumG += data[i+1];
          sumB += data[i+2];
        }
        row.push(getClosestColor(sumR/count, sumG/count, sumB/count));
      }
      colors.push(row);
    }
    setCapturedColors(colors);
  };

  const handleColorClick = (r: number, c: number) => {
    if (!capturedColors) return;
    const newColors = [...capturedColors];
    const currentColor = newColors[r][c];
    const currentIndex = PALETTE.indexOf(currentColor);
    newColors[r][c] = PALETTE[(currentIndex + 1) % PALETTE.length];
    setCapturedColors(newColors);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0f172a] flex flex-col items-center justify-center p-4">
      <button onClick={onClose} className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full">
        <X size={24} />
      </button>

      {!capturedColors ? (
        <>
          <div className="relative w-full max-w-md aspect-square bg-black rounded-xl overflow-hidden shadow-2xl">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
            />
            {/* Grid Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div 
                className="w-[80%] aspect-square border-2 border-white/50 grid"
                style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gridTemplateRows: `repeat(${size}, 1fr)` }}
              >
                {Array.from({ length: size * size }).map((_, i) => (
                  <div key={i} className="border border-white/30 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white/50" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="text-white/70 mt-6 mb-8 text-center max-w-sm">
            Align the cube face within the grid. Make sure the lighting is good and colors are clearly visible.
          </p>
          <button 
            onClick={handleCapture}
            className="flex items-center gap-2 px-8 py-4 bg-[#2563eb] text-white rounded-full font-bold text-lg hover:bg-[#1d4ed8] transition-colors"
          >
            <CameraIcon size={24} />
            Capture Face
          </button>
          <canvas ref={canvasRef} className="hidden" />
        </>
      ) : (
        <>
          <h2 className="text-white text-2xl font-bold mb-6">Verify Colors</h2>
          <div 
            className="w-full max-w-sm aspect-square grid gap-2 mb-8"
            style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gridTemplateRows: `repeat(${size}, 1fr)` }}
          >
            {capturedColors.map((row, r) => 
              row.map((color, c) => (
                <button
                  key={`${r}-${c}`}
                  onClick={() => handleColorClick(r, c)}
                  className="w-full h-full rounded-md border-2 border-white/10 shadow-inner transition-colors"
                  style={{ backgroundColor: VIBRANT_COLORS[color] }}
                />
              ))
            )}
          </div>
          <p className="text-white/70 mb-8 text-center max-w-sm">
            Tap any color to change it if the detection was incorrect.
          </p>
          
          <div className="w-full max-w-md bg-white/10 p-4 rounded-xl backdrop-blur-sm">
            <h3 className="text-white text-sm font-bold uppercase tracking-wider mb-3 text-center">Apply to Face</h3>
            <div className="grid grid-cols-3 gap-2">
              {['U', 'D', 'F', 'B', 'L', 'R'].map(face => (
                <button
                  key={face}
                  onClick={() => onApply(face, capturedColors)}
                  className="py-3 bg-white/10 text-white rounded-lg font-bold hover:bg-[#2563eb] transition-colors"
                >
                  {face === 'U' ? 'Up' : face === 'D' ? 'Down' : face === 'F' ? 'Front' : face === 'B' ? 'Back' : face === 'L' ? 'Left' : 'Right'}
                </button>
              ))}
            </div>
          </div>

          <button 
            onClick={() => setCapturedColors(null)}
            className="mt-6 flex items-center gap-2 px-6 py-3 text-white/70 hover:text-white transition-colors"
          >
            <RotateCcw size={20} />
            Retake
          </button>
        </>
      )}
    </div>
  );
}
