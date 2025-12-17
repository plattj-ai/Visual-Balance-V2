import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShapeData, Mode, ShapeType, Rect } from './types';
import { Shape } from './components/Shape';
import { BalanceBeam } from './components/BalanceBeam';
import { analyzeComposition } from './services/geminiService';
import { COLORS, SHADE_NAMES, SHADE_SATURATIONS, SHADE_WEIGHT_MULTIPLIERS, FLOOR_HEIGHT } from './constants';
import { Trash2, RotateCw, RefreshCw, HelpCircle, Wand2, ArrowRight, LayoutGrid, Scale, Grid3x3, Columns } from 'lucide-react';

const SNAP_SIZE = 20;

const App: React.FC = () => {
  // --- State ---
  const [shapes, setShapes] = useState<ShapeData[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('asymmetrical');
  const [isChallengeMode, setIsChallengeMode] = useState(false);
  // Fixed: Added state to track the number of shapes in the current challenge to be used in JSX
  const [challengeCount, setChallengeCount] = useState(0);
  const [guideMode, setGuideMode] = useState<'none' | 'thirds' | 'columns'>('none');
  
  // Sidebar controls state
  const [currentSize, setCurrentSize] = useState(100);
  const [currentShade, setCurrentShade] = useState(1); // Index 1-5
  
  // Dragging state
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const draggingShapeId = useRef<string | null>(null);
  const artboardRef = useRef<HTMLDivElement>(null);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Derived
  const selectedShape = shapes.find(s => s.id === selectedShapeId);

  // --- Helpers ---

  const snapToGrid = (value: number) => {
    return Math.round(value / SNAP_SIZE) * SNAP_SIZE;
  };

  // Simple AABB Collision
  const isOverlapping = (r1: Rect, r2: Rect) => {
    return (
      r1.x < r2.x + r2.w &&
      r1.x + r1.w > r2.x &&
      r1.y < r2.y + r2.h &&
      r1.y + r1.h > r2.y
    );
  };

  const hasCollision = (testShape: ShapeData, excludeId?: string) => {
    const r1: Rect = { x: testShape.x, y: testShape.y, w: testShape.width, h: testShape.height };
    return shapes.some(s => {
      if (excludeId && s.id === excludeId) return false;
      const r2: Rect = { x: s.x, y: s.y, w: s.width, h: s.height };
      return isOverlapping(r1, r2);
    });
  };

  // Calculate Moments for Left and Right sides
  const getMoments = useCallback(() => {
    if (!artboardRef.current) return { left: 0, right: 0 };
    const fulcrumX = artboardRef.current.offsetWidth / 2;
    
    let left = 0;
    let right = 0;

    shapes.forEach(s => {
      const centerX = s.x + s.width / 2;
      const distance = Math.abs(centerX - fulcrumX);
      const moment = s.weight * distance;
      
      if (centerX < fulcrumX) {
        left += moment;
      } else {
        right += moment;
      }
    });

    return { left, right };
  }, [shapes]);

  const moments = getMoments();
  
  // Calculate tilt angle for the beam based on moments difference
  const tiltAngle = (moments.right - moments.left) / 8000;

  // --- Actions ---

  const addShape = (type: ShapeType) => {
    if (!artboardRef.current) return;
    const boardWidth = artboardRef.current.offsetWidth;
    const boardHeight = artboardRef.current.offsetHeight;
    const fulcrumX = boardWidth / 2;

    const size = currentSize; // Height
    const width = type === 'rectangle' ? size / 2 : size;
    const shadeIdx = currentShade - 1;
    const weight = (size * width / 100) * SHADE_WEIGHT_MULTIPLIERS[shadeIdx];
    const saturation = SHADE_SATURATIONS[shadeIdx];
    const color = COLORS[type];

    let x = 0, y = 0;
    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 50) {
      attempts++;
      x = Math.random() * (boardWidth - width);
      y = Math.random() * (boardHeight - FLOOR_HEIGHT - size);
      x = snapToGrid(x);
      y = snapToGrid(y);

      if (x < 0 || x + width > boardWidth) continue;
      if (y < 0 || y + size > boardHeight - FLOOR_HEIGHT) continue;
      if (x < fulcrumX && x + width > fulcrumX) continue;

      const testShape: any = { x, y, width, height: size };
      if (!hasCollision(testShape)) {
        if (mode === 'symmetrical' && !isChallengeMode) {
          const mirrorX = boardWidth - x - width;
          const testMirror: any = { x: mirrorX, y, width, height: size };
          if (!hasCollision(testMirror)) valid = true;
        } else valid = true;
      }
    }

    if (!valid) {
      alert("No space to add shape! Try moving existing shapes.");
      return;
    }

    const newId = `shape-${Date.now()}`;
    const newShape: ShapeData = {
      id: newId,
      type,
      x,
      y,
      width,
      height: size,
      shade: currentShade,
      weight,
      saturation,
      color,
      isChallengeShape: false,
    };

    const newShapes = [newShape];
    if (mode === 'symmetrical' && !isChallengeMode) {
      const mirrorX = boardWidth - x - width;
      const mirrorId = `${newId}-mirror`;
      const mirrorShape: ShapeData = { ...newShape, id: mirrorId, x: mirrorX, mirrorId: newId };
      newShape.mirrorId = mirrorId;
      newShapes.push(mirrorShape);
    }

    setShapes(prev => [...prev, ...newShapes]);
    setSelectedShapeId(newId);
  };

  const updateShape = (id: string, updates: Partial<ShapeData>) => {
    setShapes(prev => {
      const target = prev.find(s => s.id === id);
      if (!target) return prev;
      let mirrorTarget: ShapeData | undefined;
      if (target.mirrorId) mirrorTarget = prev.find(s => s.id === target.mirrorId);

      return prev.map(s => {
        if (s.id === id) return { ...s, ...updates };
        if (mirrorTarget && s.id === target.mirrorId) {
          const mU: Partial<ShapeData> = {};
          if (updates.width) mU.width = updates.width;
          if (updates.height) mU.height = updates.height;
          if (updates.shade) mU.shade = updates.shade;
          if (updates.weight) mU.weight = updates.weight;
          if (updates.saturation) mU.saturation = updates.saturation;
          return { ...s, ...mU };
        }
        return s;
      });
    });
  };

  const deleteShape = () => {
    if (!selectedShapeId) return;
    const target = shapes.find(s => s.id === selectedShapeId);
    if (!target || target.isChallengeShape) return;
    let idsToDelete = [selectedShapeId];
    if (target.mirrorId) idsToDelete.push(target.mirrorId);
    setShapes(prev => prev.filter(s => !idsToDelete.includes(s.id)));
    setSelectedShapeId(null);
  };

  const startChallenge = () => {
    if (!artboardRef.current) return;
    setIsChallengeMode(true);
    setMode('asymmetrical'); 
    setSelectedShapeId(null);
    setShapes([]);

    const boardWidth = artboardRef.current.offsetWidth;
    const boardHeight = artboardRef.current.offsetHeight;
    const fulcrumX = boardWidth / 2;
    const floorY = boardHeight - FLOOR_HEIGHT;

    /**
     * Requirement: NO repeats on size. Each shape must be unique in size.
     * Tint (shade) also randomized but limited to pool of 5.
     */
    const generateUniqueBlueprints = (count: number) => {
        const blueprints: {size: number, shade: number}[] = [];
        // Larger pool of sizes to ensure uniqueness for up to 8 shapes
        const availableSizes = [60, 70, 80, 90, 100, 110, 120, 130, 140, 150];
        const shuffledSizes = [...availableSizes].sort(() => Math.random() - 0.5);
        
        for (let i = 0; i < count; i++) {
            blueprints.push({
                size: shuffledSizes[i],
                shade: (i % 5) + 1 // Cycles through 1-5 to keep tints varied
            });
        }
        return blueprints.sort(() => Math.random() - 0.5);
    };

    const count = Math.random() > 0.5 ? 6 : 8;
    // Fixed: Set the challengeCount state so it's accessible in the JSX
    setChallengeCount(count);
    const blueprints = generateUniqueBlueprints(count);
    let blueprintIdx = 0;
    const newShapes: ShapeData[] = [];
    
    const tryAddShape = (props: {x: number, y: number}) => {
        if (blueprintIdx >= blueprints.length) return false;
        const bp = blueprints[blueprintIdx];
        blueprintIdx++;
        
        const type = Math.random() > 0.5 ? 'square' : 'rectangle';
        const height = bp.size;
        const width = type === 'rectangle' ? height / 2 : height;
        const shade = bp.shade;
        const shadeIdx = shade - 1;
        
        const shape: ShapeData = {
            id: `challenge-${newShapes.length}`,
            type,
            x: snapToGrid(props.x),
            y: snapToGrid(props.y),
            width,
            height,
            shade,
            weight: (width * height / 100) * SHADE_WEIGHT_MULTIPLIERS[shadeIdx],
            saturation: SHADE_SATURATIONS[shadeIdx],
            color: COLORS[type],
            isChallengeShape: true
        };

        const r1: Rect = { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
        const collision = newShapes.some(s => isOverlapping(r1, { x: s.x, y: s.y, w: s.width, h: s.height }));
        
        if (!collision && shape.x + shape.width <= fulcrumX && shape.x >= 0 && shape.y + shape.height <= floorY && shape.y >= 0) {
            newShapes.push(shape);
            return true;
        }
        return false;
    };

    const patterns = ['stacked-grid', 'dynamic-pyramid', 'asym-towers', 'ascending-steps'];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];

    if (pattern === 'stacked-grid') {
        const cols = 2;
        const rows = count / 2;
        const cellW = 80;
        const cellH = 100;
        const startX = 40;
        const startY = floorY - (rows * cellH);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                tryAddShape({ x: startX + (c * cellW), y: startY + (r * cellH) });
            }
        }
    } 
    else if (pattern === 'dynamic-pyramid') {
        const size = 80;
        const startX = 20;
        // Base
        for (let i = 0; i < 3; i++) tryAddShape({ x: startX + (i * size), y: floorY - size });
        // Layer 2
        for (let i = 0; i < 2; i++) tryAddShape({ x: startX + (size/2) + (i * size), y: floorY - (size*2) });
        // Apex/Remainder
        while (blueprintIdx < blueprints.length) {
          tryAddShape({ x: startX + size, y: floorY - (size * (3 + (blueprintIdx-5))) });
        }
    }
    else if (pattern === 'asym-towers') {
        const startX = 40;
        const towerCount = 2;
        const perTower = count / 2;
        for (let t = 0; t < towerCount; t++) {
            let currentY = floorY;
            for (let i = 0; i < perTower; i++) {
                const nextSize = blueprints[blueprintIdx]?.size || 60;
                currentY -= nextSize;
                tryAddShape({ x: startX + (t * 120), y: currentY });
            }
        }
    }
    else { // ascending-steps
        const stepWidth = 45;
        for (let i = 0; i < count; i++) {
            const nextHeight = blueprints[blueprintIdx]?.size || 60;
            tryAddShape({ x: 20 + (i * stepWidth), y: floorY - nextHeight - (i * 20) });
        }
    }

    setShapes(newShapes);
  };

  const handleReset = () => {
    setShapes([]);
    setSelectedShapeId(null);
    setIsChallengeMode(false);
    setMode('asymmetrical');
  };

  const toggleGuides = () => {
    setGuideMode(prev => {
      if (prev === 'none') return 'thirds';
      if (prev === 'thirds') return 'columns';
      return 'none';
    });
  };

  const handleRotate = () => {
    if (!selectedShape || selectedShape.type !== 'rectangle' || selectedShape.isChallengeShape) return;
    const newW = selectedShape.height;
    const newH = selectedShape.width;
    const cx = selectedShape.x + selectedShape.width / 2;
    const cy = selectedShape.y + selectedShape.height / 2;
    let newX = snapToGrid(cx - newW / 2);
    let newY = snapToGrid(cy - newH / 2);

    if (!artboardRef.current) return;
    const fulcrumX = artboardRef.current.offsetWidth / 2;
    if (newY + newH > artboardRef.current.offsetHeight - FLOOR_HEIGHT) return;
    if (newX < fulcrumX && newX + newW > fulcrumX) return;
    const testShape = { ...selectedShape, x: newX, y: newY, width: newW, height: newH };
    if (hasCollision(testShape, selectedShape.id)) return;

    if (mode === 'symmetrical' && selectedShape.mirrorId) {
        const mirror = shapes.find(s => s.id === selectedShape.mirrorId);
        if (mirror) {
             const mNewX = artboardRef.current.offsetWidth - newX - newW; 
             if (!hasCollision({ ...mirror, x: mNewX, y: newY, width: newW, height: newH }, mirror.id)) {
               updateShape(mirror.id, { x: mNewX, y: newY, width: newW, height: newH });
             }
        }
    }
    updateShape(selectedShape.id, { x: newX, y: newY, width: newW, height: newH });
  };

  const handleAnalyze = async () => {
    if (shapes.length === 0) return;
    setIsAnalyzing(true);
    setShowAnalysisModal(true);
    const result = await analyzeComposition(shapes, tiltAngle, mode);
    setAnalysisResult(result);
    setIsAnalyzing(false);
  };

  const handleSizeChange = (val: number) => {
    setCurrentSize(val);
    if (selectedShape && !selectedShape.isChallengeShape && val % SNAP_SIZE === 0) {
       const nH = val;
       const nW = selectedShape.type === 'rectangle' ? val / 2 : val;
       const cx = selectedShape.x + selectedShape.width / 2;
       const cy = selectedShape.y + selectedShape.height / 2;
       let nX = snapToGrid(cx - nW / 2);
       let nY = snapToGrid(cy - nH / 2);
       if (!artboardRef.current) return;
       const fulcrumX = artboardRef.current.offsetWidth / 2;
       if (nY + nH > artboardRef.current.offsetHeight - FLOOR_HEIGHT) return;
       if (nX < fulcrumX && nX + nW > fulcrumX) return;
       if (hasCollision({ ...selectedShape, x: nX, y: nY, width: nW, height: nH }, selectedShape.id)) return;
       const shadeIdx = selectedShape.shade - 1;
       const nWt = (nH * nW / 100) * SHADE_WEIGHT_MULTIPLIERS[shadeIdx];
       updateShape(selectedShape.id, { x: nX, y: nY, width: nW, height: nH, weight: nWt });
    }
  };

  const handleShadeChange = (val: number) => {
    setCurrentShade(val);
    if (selectedShape && !selectedShape.isChallengeShape) {
        const shadeIdx = val - 1;
        const nWt = (selectedShape.height * selectedShape.width / 100) * SHADE_WEIGHT_MULTIPLIERS[shadeIdx];
        const nSat = SHADE_SATURATIONS[shadeIdx];
        updateShape(selectedShape.id, { shade: val, weight: nWt, saturation: nSat });
    }
  };

  const handleMouseDown = (e: React.MouseEvent, shape: ShapeData) => {
    e.stopPropagation(); 
    setSelectedShapeId(shape.id);
    setCurrentSize(shape.height);
    setCurrentShade(shape.shade);
    isDragging.current = true;
    draggingShapeId.current = shape.id;
    dragOffset.current = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !draggingShapeId.current || !artboardRef.current) return;
    const boardRect = artboardRef.current.getBoundingClientRect();
    const shape = shapes.find(s => s.id === draggingShapeId.current);
    if (!shape) return;
    let nX = snapToGrid(Math.max(0, Math.min(e.clientX - boardRect.left - dragOffset.current.x, boardRect.width - shape.width)));
    let nY = snapToGrid(Math.max(0, Math.min(e.clientY - boardRect.top - dragOffset.current.y, boardRect.height - FLOOR_HEIGHT - shape.height)));
    const fulcrumX = boardRect.width / 2;
    if (nX < fulcrumX && nX + shape.width > fulcrumX) {
      if (nX + shape.width / 2 < fulcrumX) nX = fulcrumX - shape.width; 
      else nX = fulcrumX; 
    }
    if (nX === shape.x && nY === shape.y) return;
    if (!hasCollision({ ...shape, x: nX, y: nY }, shape.id)) {
        if (mode === 'symmetrical' && shape.mirrorId) {
             const mirror = shapes.find(s => s.id === shape.mirrorId);
             if (mirror) {
                 const mNX = boardRect.width - nX - shape.width;
                 if (!hasCollision({ ...mirror, x: mNX, y: nY }, mirror.id)) {
                      updateShape(shape.id, { x: nX, y: nY });
                      updateShape(mirror.id, { x: mNX, y: nY });
                 }
             }
        } else updateShape(shape.id, { x: nX, y: nY });
    }
  };

  const handleMouseUp = () => { isDragging.current = false; draggingShapeId.current = null; };

  return (
    <div className="min-h-screen bg-teal-50 text-slate-900 font-sans" onMouseUp={handleMouseUp}>
      <nav className="w-full bg-white border-b border-teal-100 px-6 py-3 flex items-center justify-center sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-teal-50 p-2 rounded-xl text-teal-500"><LayoutGrid size={22} strokeWidth={2.5} /></div>
            <span className="font-display font-bold text-xl text-slate-800 tracking-tight">Visual Balance Coach</span>
          </div>
      </nav>

      <div className="p-4 md:p-8 flex flex-col items-center w-full max-w-7xl mx-auto">
        <header className="mb-6 text-center max-w-3xl mx-auto mt-4 relative">
            <p className="text-slate-600 text-lg md:text-xl font-medium leading-relaxed">
             Select shapes from the menu and position them on the artboard. 
             {isChallengeMode ? <span className="text-amber-700 font-bold ml-1">Counterbalance the structure on the left using {challengeCount} unique-sized shapes!</span> : " Adjust weight and position to create a balanced composition."}
           </p>
        </header>

        <div className="flex flex-col lg:flex-row gap-8 w-full">
          <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0">
            <div className="bg-white rounded-3xl p-6 shadow-xl shadow-teal-100/50 border border-teal-50">
              <h2 className="text-lg font-display font-bold text-slate-800 mb-4 flex items-center gap-2"><span className="w-2 h-6 bg-teal-500 rounded-full"></span>Add Shapes</h2>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button onClick={() => addShape('square')} disabled={isChallengeMode && selectedShapeId !== null} className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all border border-slate-100 group shadow-sm">
                  <div className="w-8 h-8 bg-blue-500 rounded shadow-sm mb-2 group-hover:scale-110 transition-transform"></div><span className="text-sm font-display font-bold text-slate-600">Square</span>
                </button>
                <button onClick={() => addShape('rectangle')} disabled={isChallengeMode && selectedShapeId !== null} className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all border border-slate-100 group shadow-sm">
                  <div className="w-12 h-6 bg-red-600 rounded shadow-sm mb-2 group-hover:scale-110 transition-transform"></div><span className="text-sm font-display font-bold text-slate-600">Rect</span>
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="flex justify-between mb-2"><label className="text-sm font-display font-bold text-slate-400">SIZE</label><span className="text-sm font-mono font-bold text-teal-600">{currentSize}px</span></div>
                  <input type="range" min="80" max="200" step="20" value={currentSize} onChange={(e) => handleSizeChange(Number(e.target.value))} disabled={selectedShape?.isChallengeShape} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-teal-500 disabled:opacity-50"/>
                </div>
                <div>
                  <div className="flex justify-between mb-2"><label className="text-sm font-display font-bold text-slate-400">TINT</label><span className="text-sm font-mono font-bold text-teal-600">{SHADE_NAMES[currentShade-1]}</span></div>
                  <input type="range" min="1" max="5" step="1" value={currentShade} onChange={(e) => handleShadeChange(Number(e.target.value))} disabled={selectedShape?.isChallengeShape} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-teal-500 disabled:opacity-50"/>
                  <div className="flex justify-between mt-1 px-1">{[1,2,3,4,5].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>)}</div>
                </div>
                <button onClick={handleRotate} disabled={!selectedShape || selectedShape.type !== 'rectangle' || selectedShape.isChallengeShape} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-100 rounded-xl transition-all disabled:opacity-50 font-display font-bold"><RotateCw size={18} />Rotate 90°</button>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-xl shadow-teal-100/50 border border-teal-50 flex flex-col gap-4">
               <h2 className="text-lg font-display font-bold text-slate-800 flex items-center gap-2"><span className="w-2 h-6 bg-purple-500 rounded-full"></span>Tools</h2>
              {!isChallengeMode && (
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button onClick={() => { setMode('asymmetrical'); handleReset(); }} className={`flex-1 py-2 text-sm font-bold rounded-lg ${mode === 'asymmetrical' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400'}`}>Asym</button>
                  <button onClick={() => { setMode('symmetrical'); handleReset(); }} className={`flex-1 py-2 text-sm font-bold rounded-lg ${mode === 'symmetrical' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400'}`}>Sym</button>
                </div>
              )}
              <button onClick={toggleGuides} className="w-full py-2 px-3 bg-slate-100 hover:bg-teal-50 text-slate-600 font-display font-bold rounded-xl transition-all flex items-center justify-center gap-2 border border-slate-200">
                {guideMode === 'none' && <><Grid3x3 size={18} /> Show Guides</>}
                {guideMode === 'thirds' && <><Grid3x3 size={18} className="text-teal-600"/> Rule of Thirds</>}
                {guideMode === 'columns' && <><Columns size={18} className="text-teal-600"/> Columns</>}
              </button>
              <button onClick={startChallenge} className={`w-full py-3 px-4 font-display font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${isChallengeMode ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-gradient-to-r from-amber-400 to-orange-500 text-white'}`}>
                <Wand2 size={20} />{isChallengeMode ? 'Next Challenge' : 'Start Challenge'}
              </button>
              <div className="grid grid-cols-2 gap-3 mt-2">
                 <button onClick={deleteShape} disabled={!selectedShape || selectedShape.isChallengeShape} className="flex items-center justify-center gap-2 py-3 bg-red-50 text-red-500 border border-red-100 rounded-xl transition-colors disabled:opacity-50 font-display font-bold"><Trash2 size={18} /> Delete</button>
                 <button onClick={handleReset} className="flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-600 rounded-xl transition-colors font-display font-bold"><RefreshCw size={18} /> Reset</button>
              </div>
            </div>
            
            <button onClick={handleAnalyze} disabled={shapes.length < 1 || isAnalyzing} className="w-full py-5 bg-teal-500 hover:bg-teal-400 text-white font-display font-bold text-xl rounded-3xl shadow-xl transition-all transform hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 flex items-center justify-center gap-3">
               {isAnalyzing ? <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" /> : <><div className="bg-white/20 p-1.5 rounded-full"><ArrowRight size={20} /></div>Analyze Balance</>}
            </button>
            <button onClick={() => setShowHelpModal(true)} className="text-slate-400 hover:text-teal-600 text-sm flex items-center justify-center gap-1 transition-colors font-medium"><HelpCircle size={16} /> Need Help?</button>
          </div>

          <div className="flex-grow relative h-[600px] lg:h-auto min-h-[600px] bg-slate-900 rounded-3xl shadow-2xl border-8 border-white overflow-hidden flex flex-col">
            <div className="absolute top-4 left-4 z-10"><div className="bg-slate-800/80 backdrop-blur-md border border-slate-700 rounded-xl p-3 flex flex-col items-center min-w-[120px]"><span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Left Force</span><span className="text-2xl font-mono font-bold text-teal-400">{Math.round(moments.left / 1000)}</span></div></div>
            <div className="absolute top-4 right-4 z-10"><div className="bg-slate-800/80 backdrop-blur-md border border-slate-700 rounded-xl p-3 flex flex-col items-center min-w-[120px]"><span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Right Force</span><span className="text-2xl font-mono font-bold text-purple-400">{Math.round(moments.right / 1000)}</span></div></div>

            <div ref={artboardRef} className="relative flex-grow cursor-default" onMouseDown={() => setSelectedShapeId(null)} onMouseMove={handleMouseMove} onMouseLeave={handleMouseUp}>
               {guideMode === 'thirds' && (
                 <div className="absolute top-0 left-0 right-0 bottom-[140px] pointer-events-none z-0">
                    <div className="absolute top-0 bottom-0 left-1/3 border-l-2 border-dashed border-yellow-200/50"></div>
                    <div className="absolute top-0 bottom-0 right-1/3 border-l-2 border-dashed border-yellow-200/50"></div>
                    <div className="absolute top-1/3 left-0 right-0 border-t-2 border-dashed border-yellow-200/50"></div>
                    <div className="absolute top-2/3 left-0 right-0 border-t-2 border-dashed border-yellow-200/50"></div>
                 </div>
               )}
               {guideMode === 'columns' && (
                 <div className="absolute top-0 left-0 right-0 bottom-[140px] pointer-events-none z-0 flex">
                   <div className="flex-1 border-r border-teal-500/10 bg-teal-500/5"></div>
                   <div className="flex-1 border-r border-teal-500/10"></div>
                   <div className="flex-1 border-r border-teal-500/10"></div>
                   <div className="flex-1 bg-teal-500/5"></div>
                 </div>
               )}

              {shapes.map(shape => <Shape key={shape.id} shape={shape} isSelected={selectedShapeId === shape.id} onMouseDown={handleMouseDown}/>)}
              {/* Thicker vertical center line */}
              <div className="absolute top-0 bottom-[140px] left-1/2 -translate-x-1/2 border-l-4 border-dashed border-white/30 z-0 pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 right-0 h-[140px] bg-slate-800 border-t-2 border-slate-700 z-[5]"></div>
              <BalanceBeam tiltAngle={tiltAngle} />
            </div>
          </div>
        </div>

        {showAnalysisModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-white overflow-hidden">
              <div className="p-8 md:p-10">
                <h3 className="text-3xl font-display font-bold text-slate-800 mb-6 flex items-center gap-3"><div className="p-2 bg-teal-100 rounded-xl text-teal-600"><Wand2 size={28} /></div>Coach's Feedback</h3>
                {isAnalyzing ? <div className="flex flex-col items-center justify-center py-12 space-y-4"><div className="w-12 h-12 border-4 border-teal-100 border-t-teal-500 rounded-full animate-spin"></div><p className="text-slate-500 font-medium">Analyzing your composition...</p></div> : <div className="prose prose-slate max-w-none"><div className="bg-teal-50 p-6 rounded-2xl border border-teal-100 text-slate-700 text-lg whitespace-pre-wrap">{analysisResult}</div></div>}
                <div className="mt-8 flex justify-end"><button onClick={() => setShowAnalysisModal(false)} className="px-8 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-display font-bold rounded-xl">Close</button></div>
              </div>
            </div>
          </div>
        )}

        {showHelpModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
             <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8">
               <h2 className="text-2xl font-display font-bold text-slate-800 mb-4">How to use Visual Balance Coach</h2>
               <ul className="space-y-4 text-slate-600 mb-8">
                 <li className="flex gap-3"><div className="w-6 h-6 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-sm shrink-0">1</div><span>Drag shapes onto the board. No overlapping!</span></li>
                 <li className="flex gap-3"><div className="w-6 h-6 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-sm shrink-0">2</div><span>Change <strong>Size</strong> and <strong>Tint</strong>. Darker is heavier.</span></li>
                 <li className="flex gap-3"><div className="w-6 h-6 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-sm shrink-0">3</div><span><strong>Sym Mode:</strong> Mirror shapes for easy balance.</span></li>
                 <li className="flex gap-3"><div className="w-6 h-6 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-sm shrink-0">4</div><span><strong>Challenge Mode:</strong> Balance against 6-8 unique structures!</span></li>
               </ul>
               <button onClick={() => setShowHelpModal(false)} className="w-full px-6 py-4 bg-teal-500 hover:bg-teal-400 text-white font-display font-bold rounded-2xl text-lg transition-colors">Got it!</button>
             </div>
           </div>
        )}
      </div>
    </div>
  );
};

export default App;