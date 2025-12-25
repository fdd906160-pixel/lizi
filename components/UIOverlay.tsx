
import React, { useRef, useState } from 'react';
import { Settings, Maximize, Minimize, Upload, Trash2, Box, Image as ImageIcon, Info, Gamepad2, Heart, RotateCcw, Menu, X, Zap, Droplets, Activity, Hand, Sparkles, Move, ChevronRight, User, Users, Video } from 'lucide-react';
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
  handData: (HandData & { burstTrigger?: boolean }) | null;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  showCamera: boolean;
  toggleCamera: () => void;
  gameMode: boolean;
  toggleGameMode: () => void;
  gameType: 'SINGLE' | 'DOUBLE';
  setGameType: (type: 'SINGLE' | 'DOUBLE') => void;
  score: number;
  lives: [number, number];
  isGameOver?: boolean;
  onRestart?: () => void;
  highScores: { score: number; date: string }[];
}

const PRESET_PALETTES = [
  { name: '赛博', c1: '#00ffff', c2: '#ff00ff' },
  { name: '剧毒', c1: '#39ff14', c2: '#006400' },
  { name: '烈阳', c1: '#ffd700', c2: '#ff4500' },
  { name: '深海', c1: '#00d2ff', c2: '#3a7bd5' },
  { name: '岩浆', c1: '#ff0000', c2: '#ffd700' },
  { name: '虚空', c1: '#ffffff', c2: '#4b0082' },
];

const UIOverlay: React.FC<UIOverlayProps> = ({
  config, setConfig, models, currentModelId, onModelSelect, onDeleteModel, onUpload,
  gesture, handData, isFullscreen, toggleFullscreen, showCamera, toggleCamera,
  gameMode, toggleGameMode, gameType, setGameType, score, lives, isGameOver = false, onRestart
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSelectingGameMode, setIsSelectingGameMode] = useState(false);

  const applyPreset = (c1: string, c2: string) => {
    setConfig(prev => ({ ...prev, color1: c1, color2: c2, useImageColors: false }));
  };

  const randomizeColors = () => {
    const randomHex = () => '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    setConfig(prev => ({ ...prev, color1: randomHex(), color2: randomHex(), useImageColors: false }));
  };

  const handleGameModeClick = () => {
    if (gameMode) {
      toggleGameMode(); 
    } else {
      setIsSelectingGameMode(true); 
    }
  };

  const confirmGameMode = (type: 'SINGLE' | 'DOUBLE') => {
    setGameType(type);
    setIsSelectingGameMode(false);
    toggleGameMode(); 
  };

  const gestureGuides = [
    { icon: <Hand size={24} className="text-cyan-400" />, name: "张开手掌", desc: "扩张粒子云规模，增强核心发光强度。" },
    { icon: <Move size={24} className="text-blue-400" />, name: "平移手部", desc: "粒子核心会跟随你的手掌在空间中实时移动。" },
    { icon: <Sparkles size={24} className="text-purple-400" />, name: "OK手势", desc: "在普通模式下快速循环切换不同的3D模型内核。" },
    { icon: <Zap size={24} className="text-orange-400" />, name: "双手爆发", desc: "检测到两只手并快速移开时，粒子会向四周炸开。" },
    { icon: <ImageIcon size={24} className="text-pink-400" />, name: "内核导入", desc: "支持导入图片或 FBX/OBJ/GLB 3D模型。" }
  ];

  const gestureDisplay = {
    [GestureType.NONE]: '未检测',
    [GestureType.OPEN_HAND]: '张开手掌',
    [GestureType.CLOSED_FIST]: '握拳',
    [GestureType.PINCH]: '捏合',
    [GestureType.POINT]: '指向',
    [GestureType.OK_SIGN]: '模型切换 (OK)',
    [GestureType.THUMB_SCATTER]: '拇指散射',
    [GestureType.TWO_HAND_ROTATION]: '双持交互'
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 overflow-hidden">
      <div className="flex justify-between items-start pointer-events-auto">
        <div className="flex flex-col gap-2">
            <h1 className="text-white text-3xl font-black tracking-tight drop-shadow-lg">IP手势交互</h1>
            <div className="bg-black/30 px-3 py-1.5 rounded-full border border-white/10 w-fit backdrop-blur-xl flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${gesture !== GestureType.NONE ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]' : 'bg-white/20'}`} />
                <span className="text-[11px] text-cyan-400 font-bold uppercase tracking-widest">
                  {handData?.burstTrigger ? '爆发激活！' : gestureDisplay[gesture]}
                </span>
            </div>
        </div>

        {gameMode && !isGameOver && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-fade-in w-full max-w-2xl">
             <div className="flex gap-12 justify-center w-full">
                {/* Core A Health */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-cyan-400 font-black uppercase tracking-widest">内核 A</span>
                  <div className="grid grid-cols-10 gap-0.5 bg-black/40 backdrop-blur-xl px-2 py-1.5 rounded-2xl border border-white/10 shadow-lg">
                    {[...Array(20)].map((_, i) => (
                      <Heart 
                        key={i} 
                        size={12} 
                        fill={i < lives[0] ? "#00ffff" : "transparent"} 
                        className={`${i < lives[0] ? "text-cyan-400 drop-shadow-[0_0_6px_rgba(0,255,255,0.6)]" : "text-white/10"} transition-all duration-300`} 
                      />
                    ))}
                  </div>
                </div>

                {/* Core B Health (Only in double mode) */}
                {gameType === 'DOUBLE' && (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-purple-400 font-black uppercase tracking-widest">内核 B</span>
                    <div className="grid grid-cols-10 gap-0.5 bg-black/40 backdrop-blur-xl px-2 py-1.5 rounded-2xl border border-white/10 shadow-lg">
                      {[...Array(20)].map((_, i) => (
                        <Heart 
                          key={i} 
                          size={12} 
                          fill={i < lives[1] ? "#a855f7" : "transparent"} 
                          className={`${i < lives[1] ? "text-purple-400 drop-shadow-[0_0_6px_rgba(168,85,247,0.6)]" : "text-white/10"} transition-all duration-300`} 
                        />
                      ))}
                    </div>
                  </div>
                )}
             </div>

             <div className="bg-white/5 backdrop-blur-md px-6 py-1 rounded-full border border-white/5 flex gap-4 items-center mt-2">
                <span className="text-white font-black tracking-widest text-sm">得分: {score.toString().padStart(5, '0')}</span>
                <div className="h-3 w-[1px] bg-white/20" />
                <span className="text-cyan-400 font-bold text-[10px] uppercase">{gameType === 'SINGLE' ? '单人协议' : '双核同步'}</span>
             </div>
          </div>
        )}

        <div className="flex gap-2">
            <button onClick={() => setIsGuideOpen(true)} className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-all backdrop-blur-md shadow-lg" title="手势指南">
                <Info size={24} />
            </button>
            <button onClick={toggleFullscreen} className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-all backdrop-blur-md shadow-lg" title="全屏切换">
                {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
            </button>
            <button onClick={handleGameModeClick} className={`p-3 rounded-full text-white transition-all shadow-lg ${gameMode ? 'bg-orange-500 shadow-orange-500/20' : 'bg-white/10 hover:bg-white/20'}`} title="开启游戏模式">
                <Gamepad2 size={24} />
            </button>
            <button onClick={toggleCamera} className={`p-3 rounded-full text-white transition-all shadow-lg ${showCamera ? 'opacity-100' : 'opacity-40'} bg-white/10 hover:bg-white/20`} title="摄像头切换">
                <Video size={24} />
            </button>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-all backdrop-blur-md shadow-lg">
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
        </div>
      </div>

      {isSelectingGameMode && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-[70] pointer-events-auto backdrop-blur-md">
            <div className="w-full max-w-4xl p-8 animate-in zoom-in-95 duration-500">
                <div className="text-center mb-12">
                    <h2 className="text-4xl font-black tracking-tighter text-white mb-2 italic">启动战斗内核</h2>
                    <p className="text-gray-400 text-sm tracking-[0.3em] uppercase">选择同步协议</p>
                    <div className="h-1 w-20 bg-cyan-500 mx-auto mt-4 rounded-full" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <button 
                        onClick={() => confirmGameMode('SINGLE')}
                        className="group relative bg-white/5 border border-white/10 p-10 rounded-[2.5rem] text-left hover:bg-white/10 hover:border-cyan-500/50 transition-all hover:scale-[1.02] shadow-2xl overflow-hidden"
                    >
                        <div className="relative z-10">
                            <div className="w-14 h-14 bg-cyan-500 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(6,182,212,0.4)]">
                                <User size={28} className="text-black" />
                            </div>
                            <h3 className="text-2xl font-black text-white mb-3 tracking-tight">单人作战</h3>
                            <p className="text-gray-400 text-sm leading-relaxed mb-6 font-medium">极致的单核心捕捉。适合专注突破个人记录。</p>
                            <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-widest">
                                启动引擎 <ChevronRight size={14} />
                            </div>
                        </div>
                    </button>
                    <button 
                        onClick={() => confirmGameMode('DOUBLE')}
                        className="group relative bg-white/5 border border-white/10 p-10 rounded-[2.5rem] text-left hover:bg-white/10 hover:border-purple-500/50 transition-all hover:scale-[1.02] shadow-2xl overflow-hidden"
                    >
                        <div className="relative z-10">
                            <div className="w-14 h-14 bg-purple-500 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(168,85,247,0.4)]">
                                <Users size={28} className="text-black" />
                            </div>
                            <h3 className="text-2xl font-black text-white mb-3 tracking-tight">双核共振</h3>
                            <p className="text-gray-400 text-sm leading-relaxed mb-6 font-medium">同步两路内核。支持两只手独立控制模型，血量独立计算。</p>
                            <div className="flex items-center gap-2 text-purple-400 font-bold text-xs uppercase tracking-widest">
                                启动引擎 <ChevronRight size={14} />
                            </div>
                        </div>
                    </button>
                </div>
            </div>
        </div>
      )}

      {isGuideOpen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-[60] pointer-events-auto backdrop-blur-md">
           <div className="bg-[#0a0a0a] border border-white/10 p-8 rounded-3xl w-full max-w-lg shadow-2xl relative animate-in fade-in zoom-in duration-300">
              <button onClick={() => setIsGuideOpen(false)} className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors p-2">
                 <X size={24} />
              </button>
              <h3 className="text-2xl font-black text-white mb-6 italic flex items-center gap-3">
                <Hand className="text-cyan-400" /> 交互控制说明
              </h3>
              <div className="grid gap-3">
                {gestureGuides.map((g, idx) => (
                  <div key={idx} className="flex items-center gap-5 bg-white/5 p-4 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner">
                      {g.icon}
                    </div>
                    <div>
                      <h4 className="text-white font-black text-sm tracking-widest uppercase mb-0.5">{g.name}</h4>
                      <p className="text-gray-400 text-xs leading-relaxed font-medium">{g.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setIsGuideOpen(false)} className="w-full mt-8 bg-white text-black py-4 rounded-full font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-white/10">
                我明白了
              </button>
           </div>
        </div>
      )}

      {isGameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 pointer-events-auto backdrop-blur-sm">
              <div className="bg-white/5 border border-white/10 p-12 rounded-3xl text-center backdrop-blur-3xl shadow-2xl scale-110">
                  <h2 className="text-6xl font-black text-red-500 mb-2 italic tracking-tighter uppercase">同步中断</h2>
                  <p className="text-gray-400 text-sm mb-8 tracking-[0.3em] uppercase">内核生命归零</p>
                  <div className="flex flex-col gap-2 mb-10">
                      <p className="text-white/40 text-xs font-bold uppercase">最终得分</p>
                      <p className="text-white text-5xl font-black">{score}</p>
                  </div>
                  <button onClick={onRestart} className="group relative bg-white text-black px-12 py-4 rounded-full font-black text-xl hover:scale-105 active:scale-95 transition-all overflow-hidden shadow-2xl shadow-white/5">
                      <span className="relative flex items-center gap-3">
                        <RotateCcw size={20} /> 重启系统
                      </span>
                  </button>
              </div>
          </div>
      )}

      {isMenuOpen && !gameMode && !isGameOver && (
        <div className="pointer-events-auto w-80 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 space-y-6 animate-fade-in-up overflow-y-auto max-h-[85vh] custom-scrollbar shadow-2xl">
            <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
                  <Box size={12}/> 变形目标 (内核选择)
                </label>
                <div className="grid grid-cols-2 gap-2">
                    {models.map(m => (
                        <div key={m.id} className="relative group">
                            <button 
                                onClick={() => onModelSelect(m)} 
                                className={`w-full h-10 rounded-xl text-[9px] font-black px-2 transition-all flex items-center justify-center text-center leading-tight shadow-md ${currentModelId === m.id ? 'bg-cyan-500 text-black shadow-cyan-500/20' : 'bg-white/5 text-white hover:bg-white/10'}`}
                            >
                                {m.name.slice(0, 15)}
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDeleteModel(m.id); }}
                                className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg"
                            >
                                <Trash2 size={8} />
                            </button>
                        </div>
                    ))}
                    <button onClick={() => fileInputRef.current?.click()} className="h-10 border border-white/10 border-dashed rounded-xl flex items-center justify-center text-white hover:bg-white/5 transition-colors">
                        <Upload size={14} />
                    </button>
                    <input type="file" ref={fileInputRef} onChange={onUpload} className="hidden" accept=".jpg,.jpeg,.png,.fbx,.obj,.glb,.gltf" />
                </div>
            </div>

            <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
                  <Zap size={12}/> 交互协议
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <button 
                        onClick={() => setGameType('SINGLE')} 
                        className={`py-2.5 rounded-xl text-[9px] font-black transition-all flex items-center justify-center gap-2 shadow-sm ${gameType === 'SINGLE' ? 'bg-cyan-500 text-black shadow-cyan-500/20' : 'bg-white/5 text-white hover:bg-white/10'}`}
                    >
                        <User size={12} /> 单人作战
                    </button>
                    <button 
                        onClick={() => setGameType('DOUBLE')} 
                        className={`py-2.5 rounded-xl text-[9px] font-black transition-all flex items-center justify-center gap-2 shadow-sm ${gameType === 'DOUBLE' ? 'bg-purple-600 text-white shadow-purple-500/20' : 'bg-white/5 text-white hover:bg-white/10'}`}>
                        <Users size={12} /> 双核共振
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block flex items-center justify-between">
                  <span className="flex items-center gap-2"><Droplets size={12}/> 色彩预设</span>
                  <button onClick={randomizeColors} className="text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1">
                    <Activity size={10}/> 随机
                  </button>
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_PALETTES.map(p => (
                    <button key={p.name} onClick={() => applyPreset(p.c1, p.c2)} className="group flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-full border border-white/20 transition-transform group-hover:scale-110 shadow-lg" style={{ background: `linear-gradient(135deg, ${p.c1}, ${p.c2})` }} />
                      <span className="text-[7px] text-gray-500 font-bold">{p.name}</span>
                    </button>
                  ))}
                </div>
            </div>

            <div className="space-y-4 border-t border-white/10 pt-4">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block flex items-center gap-2">
                  <Settings size={12}/> 材质实验室
                </label>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-white text-[10px]">
                      <span className="text-gray-400">金属质感</span>
                      <input type="range" min="0" max="1" step="0.01" value={config.metalness} onChange={e => setConfig({...config, metalness: parseFloat(e.target.value)})} className="w-32 accent-cyan-500" />
                  </div>
                  <div className="flex justify-between items-center text-white text-[10px]">
                      <span className="text-gray-400">粗糙度</span>
                      <input type="range" min="0" max="1" step="0.01" value={config.roughness} onChange={e => setConfig({...config, roughness: parseFloat(e.target.value)})} className="w-32 accent-cyan-500" />
                  </div>
                  <div className="flex justify-between items-center text-white text-[10px]">
                      <span className="text-gray-400">明亮度</span>
                      <input type="range" min="0.5" max="3" step="0.1" value={config.brightness} onChange={e => setConfig({...config, brightness: parseFloat(e.target.value)})} className="w-32 accent-yellow-500" />
                  </div>
                </div>
            </div>
        </div>
      )}

      <div className="text-center text-white/5 text-[9px] uppercase tracking-[0.4em] font-black">
          CHROMATIC KERNEL ENGINE v3.6.0 // NEURAL INTERFACE READY
      </div>
    </div>
  );
};

export default UIOverlay;
