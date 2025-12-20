
import React, { useRef, useState } from 'react';
// Added Video to the imports list to fix the "Cannot find name 'Video'" error
import { Settings, Maximize, Minimize, Upload, Trash2, Box, Image as ImageIcon, Info, Gamepad2, Heart, RotateCcw, Menu, X, Zap, Droplets, Activity, Hand, Sparkles, MousePointer2, Video } from 'lucide-react';
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
  gameMode: boolean;
  toggleGameMode: () => void;
  score: number;
  lives: number;
  isGameOver?: boolean;
  onRestart?: () => void;
  highScores: { score: number; date: string }[];
}

const QUICK_TINTS = [
  { name: 'Red', color: '#ff4444' },
  { name: 'Orange', color: '#ffaa00' },
  { name: 'Yellow', color: '#ffff00' },
  { name: 'Green', color: '#44ff44' },
  { name: 'Cyan', color: '#00ffff' },
  { name: 'Blue', color: '#4444ff' },
  { name: 'Purple', color: '#aa00ff' },
  { name: 'White', color: '#ffffff' },
];

const PRESET_PALETTES = [
  { name: 'Cyber', c1: '#00ffff', c2: '#ff00ff' },
  { name: 'Toxic', c1: '#39ff14', c2: '#006400' },
  { name: 'Solar', c1: '#ffd700', c2: '#ff4500' },
  { name: 'Ocean', c1: '#00d2ff', c2: '#3a7bd5' },
  { name: 'Lava', c1: '#ff0000', c2: '#ffd700' },
  { name: 'Void', c1: '#ffffff', c2: '#4b0082' },
];

const UIOverlay: React.FC<UIOverlayProps> = ({
  config, setConfig, models, currentModelId, onModelSelect, onDeleteModel, onUpload,
  gesture, isFullscreen, toggleFullscreen, showCamera, toggleCamera,
  gameMode, toggleGameMode, score, lives, isGameOver = false, onRestart
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const applyPreset = (c1: string, c2: string) => {
    setConfig(prev => ({ ...prev, color1: c1, color2: c2, useImageColors: false }));
  };

  const applyTint = (color: string) => {
    setConfig(prev => ({ ...prev, color1: color, color2: color, useImageColors: false }));
  };

  const randomizeColors = () => {
    const randomHex = () => '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    setConfig(prev => ({ ...prev, color1: randomHex(), color2: randomHex(), useImageColors: false }));
  };

  const gestureGuides = [
    { icon: <Hand size={24} className="text-cyan-400" />, name: "Open Hand", desc: "Expand particle cloud and increase glow." },
    { icon: <Zap size={24} className="text-orange-400" />, name: "Closed Fist", desc: "Contract particles into a dense core." },
    { icon: <Sparkles size={24} className="text-purple-400" />, name: "OK Sign", desc: "Cycle through 3D Morphing Targets." },
    { icon: <MousePointer2 size={24} className="text-pink-400" />, name: "Palm Move", desc: "Drag the kernel across the coordinate space." }
  ];

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 overflow-hidden">
      {/* Top Header */}
      <div className="flex justify-between items-start pointer-events-auto">
        <div className="flex flex-col gap-2">
            <h1 className="text-white text-3xl font-black tracking-tight">IP手势交互</h1>
            <div className="bg-white/10 px-3 py-1 rounded-full border border-white/10 w-fit backdrop-blur-md flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${gesture !== 'NONE' ? 'bg-cyan-500 animate-pulse' : 'bg-white/20'}`} />
                <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">{gesture}</span>
            </div>
        </div>

        {/* Game Stats */}
        {gameMode && !isGameOver && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-fade-in">
             <div className="flex gap-2 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 shadow-lg">
                {[...Array(3)].map((_, i) => (
                  <Heart 
                    key={i} 
                    size={22} 
                    fill={i < lives ? "#ff3366" : "transparent"} 
                    className={`${i < lives ? "text-[#ff3366] drop-shadow-[0_0_8px_rgba(255,51,102,0.6)]" : "text-white/20"} transition-all duration-300`} 
                  />
                ))}
             </div>
             <div className="bg-white/5 backdrop-blur-md px-6 py-1 rounded-full border border-white/5">
                <span className="text-white font-black tracking-widest text-sm">SCORE: {score.toString().padStart(5, '0')}</span>
             </div>
          </div>
        )}

        <div className="flex gap-2">
            <button onClick={() => setIsGuideOpen(true)} className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-all backdrop-blur-md" title="Gesture Guide">
                <div className="flex items-center justify-center">
                    <Info size={24} />
                </div>
            </button>
            <button onClick={toggleFullscreen} className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-all backdrop-blur-md" title="Toggle Fullscreen">
                <div className="flex items-center justify-center">
                    {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
                </div>
            </button>
            <button onClick={toggleGameMode} className={`p-3 rounded-full text-white transition-all ${gameMode ? 'bg-orange-500 shadow-lg shadow-orange-500/20' : 'bg-white/10 hover:bg-white/20'}`}>
                <div className="flex items-center justify-center">
                    <Gamepad2 size={24} />
                </div>
            </button>
            <button onClick={toggleCamera} className={`p-3 rounded-full text-white transition-all ${showCamera ? 'opacity-100' : 'opacity-40'} bg-white/10 hover:bg-white/20`}>
                <div className="flex items-center justify-center">
                    <Video size={24} />
                </div>
            </button>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-all backdrop-blur-md">
                <div className="flex items-center justify-center">
                    {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </div>
            </button>
        </div>
      </div>

      {/* Gesture Guide Modal */}
      {isGuideOpen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-[60] pointer-events-auto backdrop-blur-md">
           <div className="bg-[#0a0a0a] border border-white/10 p-8 rounded-3xl w-full max-w-lg shadow-2xl relative animate-in fade-in zoom-in duration-300">
              <button onClick={() => setIsGuideOpen(false)} className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors">
                 <X size={24} />
              </button>
              <h3 className="text-2xl font-black text-white mb-6 italic flex items-center gap-3">
                <Hand className="text-cyan-400" /> KERNEL COMMANDS
              </h3>
              <div className="grid gap-4">
                {gestureGuides.map((g, idx) => (
                  <div key={idx} className="flex items-center gap-6 bg-white/5 p-4 rounded-2xl border border-white/5">
                    <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                      {g.icon}
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-sm tracking-widest uppercase">{g.name}</h4>
                      <p className="text-gray-400 text-xs leading-relaxed">{g.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setIsGuideOpen(false)} className="w-full mt-8 bg-white text-black py-4 rounded-full font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all">
                Understood
              </button>
           </div>
        </div>
      )}

      {isGameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 pointer-events-auto backdrop-blur-sm">
              <div className="bg-white/5 border border-white/10 p-12 rounded-3xl text-center backdrop-blur-3xl shadow-2xl scale-110">
                  <h2 className="text-6xl font-black text-red-500 mb-2 italic tracking-tighter">SYSTEM FAILED</h2>
                  <p className="text-gray-400 text-sm mb-8 tracking-[0.3em] uppercase">Kernel destabilized</p>
                  <div className="flex flex-col gap-2 mb-10">
                      <p className="text-white/40 text-xs font-bold uppercase">Final Score</p>
                      <p className="text-white text-5xl font-black">{score}</p>
                  </div>
                  <button onClick={onRestart} className="group relative bg-white text-black px-12 py-4 rounded-full font-black text-xl hover:scale-105 active:scale-95 transition-all overflow-hidden">
                      <div className="absolute inset-0 bg-red-500/10 -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
                      <span className="relative flex items-center gap-3">
                        <RotateCcw size={20} /> REBOOT SYSTEM
                      </span>
                  </button>
              </div>
          </div>
      )}

      {isMenuOpen && !gameMode && !isGameOver && (
        <div className="pointer-events-auto w-80 bg-black/70 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 space-y-6 animate-fade-in-up overflow-y-auto max-h-[85vh] custom-scrollbar">
            <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 block flex items-center justify-between">
                  <span>Quick Tints</span>
                  <button onClick={randomizeColors} className="text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1">
                    <Activity size={10}/> Randomize
                  </button>
                </label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TINTS.map(t => (
                    <button 
                      key={t.name}
                      onClick={() => applyTint(t.color)}
                      className="w-6 h-6 rounded-full border border-white/20 hover:scale-125 transition-transform"
                      style={{ backgroundColor: t.color }}
                      title={t.name}
                    />
                  ))}
                </div>
            </div>

            <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
                  <Box size={12}/> Morph Targets
                </label>
                <div className="grid grid-cols-2 gap-2">
                    {models.map(m => (
                        <div key={m.id} className="relative group">
                            <button 
                                onClick={() => onModelSelect(m)} 
                                className={`w-full h-10 rounded-xl text-[9px] font-bold px-2 transition-all flex items-center justify-center text-center leading-tight ${currentModelId === m.id ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'bg-white/5 text-white hover:bg-white/10'}`}
                            >
                                {m.name.slice(0, 15)}
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDeleteModel(m.id); }}
                                className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            >
                                <Trash2 size={8} />
                            </button>
                        </div>
                    ))}
                    <button onClick={() => fileInputRef.current?.click()} className="h-10 border border-white/10 border-dashed rounded-xl flex items-center justify-center text-white hover:bg-white/5">
                        <Upload size={14} />
                    </button>
                    <input type="file" ref={fileInputRef} onChange={onUpload} className="hidden" accept=".jpg,.jpeg,.png,.fbx,.obj,.glb,.gltf" />
                </div>
            </div>

            <div className="space-y-4">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block flex items-center gap-2">
                  <Droplets size={12}/> Chromatic Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_PALETTES.map(p => (
                    <button key={p.name} onClick={() => applyPreset(p.c1, p.c2)} className="group flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-full border border-white/20 transition-transform group-hover:scale-110" style={{ background: `linear-gradient(135deg, ${p.c1}, ${p.c2})` }} />
                      <span className="text-[7px] text-gray-500 font-bold">{p.name}</span>
                    </button>
                  ))}
                </div>
            </div>

            <div className="space-y-4 border-t border-white/10 pt-4">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block flex items-center gap-2">
                  <Settings size={12}/> Material Lab
                </label>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-white text-[10px]">
                      <span className="text-gray-400">Metalness (质感)</span>
                      <input type="range" min="0" max="1" step="0.01" value={config.metalness} onChange={e => setConfig({...config, metalness: parseFloat(e.target.value)})} className="w-32 accent-cyan-500" />
                  </div>
                  <div className="flex justify-between items-center text-white text-[10px]">
                      <span className="text-gray-400">Roughness (磨砂)</span>
                      <input type="range" min="0" max="1" step="0.01" value={config.roughness} onChange={e => setConfig({...config, roughness: parseFloat(e.target.value)})} className="w-32 accent-cyan-500" />
                  </div>
                  <div className="flex justify-between items-center text-white text-[10px]">
                      <span className="text-gray-400">Brightness (亮度)</span>
                      <input type="range" min="0.5" max="3" step="0.1" value={config.brightness} onChange={e => setConfig({...config, brightness: parseFloat(e.target.value)})} className="w-32 accent-yellow-500" />
                  </div>
                  <div className="flex justify-between items-center text-white text-[10px]">
                      <span className="text-gray-400">Glow (发光)</span>
                      <input type="range" min="0" max="5" step="0.1" value={config.glowIntensity} onChange={e => setConfig({...config, glowIntensity: parseFloat(e.target.value)})} className="w-32 accent-purple-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4">
                    <button onClick={() => setConfig({...config, useImageColors: !config.useImageColors})} className={`py-2 rounded-xl text-[9px] font-bold transition-all flex items-center justify-center gap-2 ${config.useImageColors ? 'bg-purple-500 text-white' : 'bg-white/5 text-gray-400'}`}>
                        <ImageIcon size={12} /> TEXTURE
                    </button>
                    <button onClick={() => setConfig({...config, useDepth: !config.useDepth})} className={`py-2 rounded-xl text-[9px] font-bold transition-all flex items-center justify-center gap-2 ${config.useDepth ? 'bg-orange-500 text-white' : 'bg-white/5 text-gray-400'}`}>
                        <Box size={12} /> DEPTH
                    </button>
                </div>
            </div>

            <div className="text-[9px] text-gray-500 text-center leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">
                👌 <span className="text-cyan-400">OK SIGN</span>: CYCLE KERNELS
            </div>
        </div>
      )}

      <div className="text-center text-white/5 text-[9px] uppercase tracking-[0.4em]">
          CHROMATIC KERNEL v3.2.1
      </div>
    </div>
  );
};

export default UIOverlay;
