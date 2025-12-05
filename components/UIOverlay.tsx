import React, { useRef, useState, useEffect } from 'react';
import { Settings, Maximize, Minimize, Hand, Upload, Palette, Video, VideoOff, Trash2, Box, Image as ImageIcon } from 'lucide-react';
import { ParticleConfig, ImageModel, GestureType, HandData } from '../types';

interface UIOverlayProps {
  config: ParticleConfig;
  setConfig: React.Dispatch<React.SetStateAction<ParticleConfig>>;
  models: ImageModel[];
  currentModelId: string;
  onModelSelect: (model: ImageModel) => void;
  onDeleteModel: (id: string) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  gesture: GestureType;
  handData: HandData | null;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  showCamera: boolean;
  toggleCamera: () => void;
}

const UIOverlay: React.FC<UIOverlayProps> = ({
  config,
  setConfig,
  models,
  currentModelId,
  onModelSelect,
  onDeleteModel,
  onUpload,
  gesture,
  handData,
  isFullscreen,
  toggleFullscreen,
  showCamera,
  toggleCamera,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Interaction State
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [hoverProgress, setHoverProgress] = useState(0);
  const hoverStartTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const getGestureIcon = () => {
    switch (gesture) {
      case GestureType.OPEN_HAND: return <span className="text-green-400 font-bold">SCALE UP</span>;
      case GestureType.CLOSED_FIST: return <span className="text-red-400 font-bold">SCALE DOWN</span>;
      case GestureType.PINCH: return <span className="text-blue-400 font-bold">ROTATE</span>;
      case GestureType.POINT: return <span className="text-cyan-400 font-bold">MOVE / SELECT</span>;
      case GestureType.OK_SIGN: return <span className="text-orange-400 font-bold">NEXT MODEL</span>;
      case GestureType.THUMB_SCATTER: return <span className="text-fuchsia-400 font-bold animate-pulse">THUMB SCATTER</span>;
      case GestureType.TWO_HAND_ROTATION: return <span className="text-yellow-400 font-bold">DUAL CONTROL</span>;
      default: return <span className="text-gray-400">IDLE</span>;
    }
  };

  // --- Gesture Interaction Loop ---
  useEffect(() => {
    const checkCollisions = () => {
        if (!handData || !handData.pointerPosition || gesture !== GestureType.POINT) {
            setHoverTarget(null);
            setHoverProgress(0);
            return;
        }

        // Map normalized coordinates to screen pixels
        // X is flipped because camera is usually mirrored
        const x = (1 - handData.pointerPosition.x) * window.innerWidth;
        const y = handData.pointerPosition.y * window.innerHeight;

        let foundTarget = null;

        // Check collision with model buttons
        for (const [id, el] of buttonRefs.current.entries()) {
            const rect = el.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                foundTarget = id;
                break;
            }
        }

        if (foundTarget) {
            if (foundTarget !== hoverTarget) {
                setHoverTarget(foundTarget);
                hoverStartTimeRef.current = Date.now();
                setHoverProgress(0);
            } else {
                // Already hovering this target, increment progress
                const duration = 1000; // 1 second to click
                const elapsed = Date.now() - hoverStartTimeRef.current;
                const progress = Math.min((elapsed / duration) * 100, 100);
                setHoverProgress(progress);

                if (progress >= 100) {
                    // Trigger Click
                    const model = models.find(m => m.id === foundTarget);
                    if (model && model.id !== currentModelId) {
                        onModelSelect(model);
                    }
                    // Reset to avoid multi-click
                    hoverStartTimeRef.current = Date.now(); 
                    setHoverProgress(0);
                    // Optional: Small cooldown or feedback could be added here
                }
            }
        } else {
            setHoverTarget(null);
            setHoverProgress(0);
        }
    };

    const loop = () => {
        checkCollisions();
        rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [handData, gesture, models, currentModelId, hoverTarget, onModelSelect]);


  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 overflow-hidden">
      
      {/* 2D Interaction Cursor */}
      {handData?.pointerPosition && gesture === GestureType.POINT && (
          <div 
            className="absolute w-8 h-8 rounded-full border-2 border-cyan-400 flex items-center justify-center z-50 transition-transform duration-75 ease-out"
            style={{ 
                left: `${(1 - handData.pointerPosition.x) * 100}%`, 
                top: `${handData.pointerPosition.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)'
            }}
          >
              <div className="w-1 h-1 bg-cyan-400 rounded-full" />
              {hoverProgress > 0 && (
                  <svg className="absolute w-10 h-10 -rotate-90 pointer-events-none">
                      <circle 
                        r="18" cx="20" cy="20" 
                        fill="transparent" 
                        stroke="#22d3ee" 
                        strokeWidth="2" 
                        strokeDasharray="113"
                        strokeDashoffset={113 - (113 * hoverProgress) / 100}
                      />
                  </svg>
              )}
          </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start pointer-events-auto">
        <div>
          <h1 className="text-white text-3xl font-bold tracking-tighter drop-shadow-lg">MORPH<span className="text-cyan-400">3D</span></h1>
          <div className="flex items-center gap-2 mt-2 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
            <Hand size={16} className="text-white" />
            <span className="text-sm text-gray-200">Gesture: {getGestureIcon()}</span>
          </div>
        </div>

        <div className="flex gap-2">
            <button 
                onClick={toggleCamera} 
                className={`p-3 backdrop-blur-md rounded-full text-white transition-all ${showCamera ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'}`}
                title="Toggle Camera View"
            >
                {showCamera ? <Video size={24} /> : <VideoOff size={24} />}
            </button>
            <button 
                onClick={toggleFullscreen} 
                className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all"
            >
                {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
            </button>
        </div>
      </div>

      {/* Main Controls Panel */}
      <div className="pointer-events-auto w-full max-w-xs bg-black/70 backdrop-blur-xl rounded-2xl p-5 border border-white/10 shadow-2xl space-y-6">
        
        {/* Model Selection */}
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 block">Models</label>
          <div className="grid grid-cols-3 gap-2">
            {models.map((model, index) => (
              <div key={model.id} className="relative group">
                  <button
                    ref={(el) => {
                        if (el) buttonRefs.current.set(model.id, el);
                        else buttonRefs.current.delete(model.id);
                    }}
                    onClick={() => onModelSelect(model)}
                    className={`relative w-full py-2 px-1 rounded-lg text-xs font-medium transition-all h-full flex flex-col items-center justify-center gap-0.5 overflow-hidden ${
                      currentModelId === model.id 
                        ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.5)]' 
                        : 'bg-white/5 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    {/* Hover Progress Fill */}
                    {hoverTarget === model.id && hoverProgress > 0 && (
                        <div 
                            className="absolute inset-0 bg-cyan-400/30 z-0" 
                            style={{ height: `${hoverProgress}%`, top: 'auto', bottom: 0 }}
                        />
                    )}
                    
                    <div className="relative z-10 flex flex-col items-center">
                        <span className={`text-[9px] uppercase tracking-wider font-bold leading-none ${currentModelId === model.id ? 'opacity-60' : 'opacity-30'}`}>
                            Model {index + 1}
                        </span>
                        <span className="truncate max-w-full leading-tight px-1">{model.name}</span>
                    </div>
                  </button>
                  {/* Delete Button (Only show if more than 1 model exists) */}
                  {models.length > 1 && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteModel(model.id); }}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 shadow-lg z-10"
                        title="Delete Model"
                      >
                          <Trash2 size={10} />
                      </button>
                  )}
              </div>
            ))}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="py-2 px-1 rounded-lg text-xs font-medium bg-white/5 text-gray-300 hover:bg-white/10 flex flex-col items-center justify-center gap-1 min-h-[48px] border border-white/5 border-dashed"
            >
              <Upload size={14} className="opacity-60" /> 
              <span>Upload</span>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={onUpload} 
              className="hidden" 
              accept="image/*"
            />
          </div>
        </div>

        {/* Style Controls */}
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Palette size={12} /> Style
          </label>
          
          <div className="space-y-4">
            {/* Color Controls */}
            {!config.useImageColors && (
                <>
                <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Start Color</span>
                <input 
                    type="color" 
                    value={config.color1} 
                    onChange={(e) => setConfig({...config, color1: e.target.value})}
                    className="w-8 h-8 rounded-full border border-white/20 cursor-pointer bg-transparent p-0"
                />
                </div>
                
                <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">End Color</span>
                <input 
                    type="color" 
                    value={config.color2} 
                    onChange={(e) => setConfig({...config, color2: e.target.value})}
                    className="w-8 h-8 rounded-full border border-white/20 cursor-pointer bg-transparent p-0"
                />
                </div>
                </>
            )}

            <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg">
                <span className="text-sm text-gray-300 flex items-center gap-2"><ImageIcon size={14}/> Original Colors</span>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        checked={config.useImageColors} 
                        onChange={(e) => setConfig({...config, useImageColors: e.target.checked})}
                        className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                </label>
            </div>

             <div className="space-y-2">
                <span className="text-sm text-gray-300">Particle Size</span>
                <input 
                    type="range" 
                    min="0.1" 
                    max="2" 
                    step="0.1"
                    value={config.size}
                    onChange={(e) => setConfig({...config, size: parseFloat(e.target.value)})}
                    className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full"
                />
            </div>

            {!config.useImageColors && (
                <div className="flex gap-2 p-1 bg-white/5 rounded-lg">
                    <button 
                        onClick={() => setConfig({...config, gradientType: 'radial'})}
                        className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${config.gradientType === 'radial' ? 'bg-white/20 text-white' : 'text-gray-400'}`}
                    >
                        Radial
                    </button>
                    <button 
                        onClick={() => setConfig({...config, gradientType: 'angular'})}
                        className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${config.gradientType === 'angular' ? 'bg-white/20 text-white' : 'text-gray-400'}`}
                    >
                        Angular
                    </button>
                    <button 
                        onClick={() => setConfig({...config, gradientType: 'linear'})}
                        className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${config.gradientType === 'linear' ? 'bg-white/20 text-white' : 'text-gray-400'}`}
                    >
                        Linear
                    </button>
                </div>
            )}
          </div>
        </div>

        {/* 3D Depth Controls */}
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
             <Box size={12} /> 3D Depth (Import)
          </label>
          
          <div className="space-y-3 bg-white/5 p-3 rounded-lg border border-white/5">
             <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Enable 3D Depth</span>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        checked={config.useDepth} 
                        onChange={(e) => setConfig({...config, useDepth: e.target.checked})}
                        className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
             </div>
             
             {config.useDepth && (
                 <div className="space-y-2 animate-fade-in">
                    <div className="flex justify-between text-xs text-gray-400">
                        <span>Flat</span>
                        <span>Deep</span>
                    </div>
                    <input 
                        type="range" 
                        min="5" 
                        max="80" 
                        step="5"
                        value={config.depthIntensity}
                        onChange={(e) => setConfig({...config, depthIntensity: parseFloat(e.target.value)})}
                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full"
                    />
                </div>
             )}
          </div>
        </div>

      </div>

      <div className="text-center text-white/30 text-xs pointer-events-auto">
        <p>Use hand gestures to interact. Point to select models.</p>
      </div>
    </div>
  );
};

export default UIOverlay;