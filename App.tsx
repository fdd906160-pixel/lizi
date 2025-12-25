
import React, { useState, useEffect, useRef } from 'react';
import { Canvas, extend } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import Particles from './components/Particles';
import UIOverlay from './components/UIOverlay';
import { SpaceGame } from './components/SpaceGame';
import { initializeHandLandmarker, detectHands, DetectionResult } from './services/visionService';
import { startMusic, stopMusic, playHitSound, playGameOverSound, playHealSound, playSlowSound } from './services/audioService';
import { HandData, GestureType, ParticleConfig, ImageModel } from './types';
import { MODELS } from './constants';
import { AlertCircle, Zap, RefreshCw } from 'lucide-react';

extend(THREE as any);

interface HighScore {
  score: number;
  date: string;
}

type GameType = 'SINGLE' | 'DOUBLE';

const App: React.FC = () => {
  const [isStarted, setIsStarted] = useState(false);
  const [gameType, setGameType] = useState<GameType>('SINGLE');
  const [hands, setHands] = useState<HandData[]>([]);
  const [models, setModels] = useState<ImageModel[]>(MODELS);
  
  const [topModel, setTopModel] = useState<ImageModel>(MODELS[0]);
  const [bottomModel, setBottomModel] = useState<ImageModel>(MODELS.length > 1 ? MODELS[1] : MODELS[0]);
  
  const [config, setConfig] = useState<ParticleConfig>({
    color1: '#00ffff',
    color2: '#ff00ff',
    gradientType: 'radial',
    size: 0.22,
    glowIntensity: 1.5,
    useDepth: false,
    depthIntensity: 30,
    useImageColors: false,
    metalness: 0.5,
    roughness: 0.2,
    brightness: 1.0
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [showCamera, setShowCamera] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gameMode, setGameMode] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isBursting, setIsBursting] = useState(false);
  const [isSuperBursting, setIsSuperBursting] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState<[number, number]>([10, 10]);
  const [playerHit, setPlayerHit] = useState<[boolean, boolean]>([false, false]);
  const [playerHeal, setPlayerHeal] = useState<[boolean, boolean]>([false, false]);
  const [slowEffectActive, setSlowEffectActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>(0);
  const lastSwitchTimeRef = useRef<number>(0);
  const burstTimeoutRef = useRef<number>(0);
  const superBurstTimeoutRef = useRef<number>(0);
  const slowTimerTimeoutRef = useRef<number>(0);
  
  const playerPosRefs = [useRef<THREE.Vector3>(new THREE.Vector3()), useRef<THREE.Vector3>(new THREE.Vector3())];
  const playerScaleRefs = [useRef<number>(1), useRef<number>(1)];

  useEffect(() => {
    const preload = async () => {
      try {
        await initializeHandLandmarker();
        setIsEngineReady(true);
      } catch (e) {
        console.warn("Vision preload failed.");
      }
    };
    preload();

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      stopMusic();
      clearTimeout(slowTimerTimeoutRef.current);
    };
  }, []);

  const handleStartInitialization = async () => {
    setIsLoading(true);
    try {
      if (!isEngineReady) await initializeHandLandmarker();
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user", width: 640, height: 480 } 
      });
      streamRef.current = stream;
      setIsStarted(true);
    } catch (err: any) {
      setError("Failed to initialize system.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    if (isStarted && videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play();
    }
  }, [isStarted]);

  useEffect(() => {
    if (!isStarted) return;
    const loop = () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const result = detectHands(videoRef.current, showCamera ? canvasRef.current : null);
        if (result) {
            setHands(result.hands);
            if (result.superBurstTrigger && !isSuperBursting) {
                setIsSuperBursting(true);
                if (window.navigator.vibrate) window.navigator.vibrate([100, 50, 100]);
                superBurstTimeoutRef.current = window.setTimeout(() => setIsSuperBursting(false), 2500);
            }
            if (result.burstTrigger && !isBursting) {
                setIsBursting(true);
                if (window.navigator.vibrate) window.navigator.vibrate(50);
                burstTimeoutRef.current = window.setTimeout(() => setIsBursting(false), 2000);
            }
            if (!gameMode && result.hands.length > 0 && result.hands[0].gesture === GestureType.OK_SIGN) {
                if (Date.now() - lastSwitchTimeRef.current > 1500) {
                    const idx = models.findIndex(m => m.id === topModel.id);
                    const nextIdx = (idx + 1) % models.length;
                    setTopModel(models[nextIdx]);
                    if (gameType === 'DOUBLE' && models.length > 1) {
                        setBottomModel(models[(nextIdx + 1) % models.length]);
                    }
                    lastSwitchTimeRef.current = Date.now();
                }
            }
        } else {
            setHands([]);
        }
      }
      requestRef.current = requestAnimationFrame(loop);
    };
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isStarted, topModel, bottomModel, models, gameMode, showCamera, isBursting, isSuperBursting, gameType]);

  useEffect(() => {
    if (gameMode && !isGameOver) {
      startMusic();
    } else {
      stopMusic();
    }
  }, [gameMode, isGameOver]);

  const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsImporting(true);
      const file = e.target.files[0];
      const extension = file.name.split('.').pop()?.toLowerCase();
      const is3D = ['fbx', 'obj', 'glb', 'gltf'].includes(extension || '');

      if (is3D) {
          const url = URL.createObjectURL(file);
          const newModel: ImageModel = { id: 'custom-' + Date.now(), name: file.name, src: url, type: '3d', extension: extension };
          setModels(prev => [...prev, newModel]);
          setTopModel(newModel);
          setIsImporting(false);
      } else {
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (ev.target?.result) {
              const newModel: ImageModel = { id: 'custom-' + Date.now(), name: file.name.split('.')[0], src: ev.target.result as string, type: 'image' };
              setModels(prev => [...prev, newModel]);
              setTopModel(newModel);
              setConfig(prev => ({...prev, useDepth: true, useImageColors: true}));
              setIsImporting(false);
            }
          };
          reader.readAsDataURL(file);
      }
    }
  };

  const handleDeleteModel = (id: string) => {
    setModels(prev => {
        const filtered = prev.filter(m => m.id !== id);
        if (topModel.id === id) setTopModel(filtered.length > 0 ? filtered[0] : MODELS[0]);
        if (bottomModel.id === id) setBottomModel(filtered.length > 1 ? filtered[1] : MODELS[0]);
        return filtered.length > 0 ? filtered : MODELS;
    });
  };

  const handleToggleGameMode = () => {
    if (gameMode) {
      setGameType('SINGLE');
      setIsGameOver(false); 
      setSlowEffectActive(false);
    }
    setGameMode(!gameMode);
  };

  const handleHit = (index: number) => {
    if (isGameOver || playerHit[index]) return;
    setLives(prev => {
        const newLives = [...prev] as [number, number];
        newLives[index] = Math.max(0, newLives[index] - 1);
        if (newLives[index] <= 0) {
            setIsGameOver(true);
            playGameOverSound();
            stopMusic();
        } else {
            playHitSound();
        }
        return newLives;
    });
    setPlayerHit(prev => {
        const newHit = [...prev] as [boolean, boolean];
        newHit[index] = true;
        return newHit;
    });
    setTimeout(() => setPlayerHit(prev => {
        const newHit = [...prev] as [boolean, boolean];
        newHit[index] = false;
        return newHit;
    }), 800);
  };

  const handleHeal = (index: number) => {
    if (lives[index] >= 20) return;
    setLives(prev => {
        const newLives = [...prev] as [number, number];
        newLives[index] = Math.min(newLives[index] + 1, 20);
        return newLives;
    });
    playHealSound();
    setPlayerHeal(prev => {
        const newHeal = [...prev] as [boolean, boolean];
        newHeal[index] = true;
        return newHeal;
    });
    setTimeout(() => setPlayerHeal(prev => {
        const newHeal = [...prev] as [boolean, boolean];
        newHeal[index] = false;
        return newHeal;
    }), 500);
  };

  const handleSlow = (index: number) => {
    playSlowSound();
    setSlowEffectActive(true);
    clearTimeout(slowTimerTimeoutRef.current);
    slowTimerTimeoutRef.current = window.setTimeout(() => setSlowEffectActive(false), 5000);
  };

  return (
    <div className="relative w-full h-full bg-[#050505] overflow-hidden">
      {!isStarted ? (
        <div className="flex flex-col items-center justify-center h-full text-white text-center px-6 animate-in fade-in duration-700">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full" />
              <Zap size={80} className="text-cyan-400 relative animate-pulse" />
            </div>
            <h1 className="text-6xl font-black mb-4 tracking-tighter">双内核手势系统</h1>
            <p className="text-gray-500 text-sm max-w-xs mb-10 tracking-widest uppercase font-bold">同步多线程流体交互引擎</p>
            {error && <p className="text-red-500 mb-6 bg-red-500/10 px-4 py-2 rounded-lg flex items-center gap-2 border border-red-500/20"><AlertCircle size={16}/> {error}</p>}
            <button onClick={handleStartInitialization} className="group relative bg-white text-black px-16 py-5 rounded-full font-black text-xl overflow-hidden hover:scale-110 transition-transform active:scale-95 disabled:opacity-50" disabled={isLoading}>
                <div className="absolute inset-0 bg-cyan-500/10 group-hover:translate-x-full transition-transform duration-500 -skew-x-12 -translate-x-full" />
                <span className="relative">{isLoading ? "同步中..." : "启动引擎"}</span>
            </button>
        </div>
      ) : (
        <>
            {isImporting && (
              <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center">
                 <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="text-cyan-400 animate-spin" size={40} />
                    <span className="text-white text-sm font-bold tracking-widest animate-pulse">正在重构内核数据...</span>
                 </div>
              </div>
            )}
            <div className={`absolute bottom-6 right-6 w-64 h-48 border-2 border-white/20 rounded-2xl z-50 overflow-hidden shadow-2xl transition-all ${showCamera ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                <video ref={videoRef} className="w-full h-full object-cover" style={{transform: 'scaleX(-1)'}} playsInline muted />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{transform: 'scaleX(-1)'}} />
            </div>
            <Canvas camera={{ position: [0, 0, gameType === 'DOUBLE' ? 180 : 150] }} dpr={[1, 1.5]} gl={{ antialias: false, stencil: false, depth: true }} performance={{ min: 0.5 }}>
                <Particles 
                    model={topModel} 
                    handData={hands[0] || null} 
                    config={config} 
                    playerPosRef={playerPosRefs[0]} 
                    playerScaleRef={playerScaleRefs[0]}
                    isHit={playerHit[0]} 
                    isGameOver={isGameOver}
                    isBursting={isBursting}
                    isSuperBursting={isSuperBursting}
                    isGameActive={gameMode} 
                />
                
                {gameType === 'DOUBLE' && (
                  <Particles 
                      model={bottomModel} 
                      handData={hands[1] || (hands.length === 1 ? hands[0] : null)} 
                      config={config} 
                      playerPosRef={playerPosRefs[1]} 
                      playerScaleRef={playerScaleRefs[1]}
                      isHit={playerHit[1]} 
                      isGameOver={isGameOver}
                      isBursting={isBursting}
                      isSuperBursting={isSuperBursting}
                      isGameActive={gameMode} 
                  />
                )}

                <SpaceGame 
                    playerPosRefs={gameType === 'DOUBLE' ? playerPosRefs : [playerPosRefs[0]]} 
                    playerScaleRefs={gameType === 'DOUBLE' ? playerScaleRefs : [playerScaleRefs[0]]}
                    isGameActive={gameMode && !isGameOver} 
                    onHit={handleHit} 
                    onHeal={handleHeal}
                    onSlow={handleSlow}
                    onScore={s => setScore(prev => prev + s)} 
                    score={score} 
                />
                <Environment preset="night" />
                <OrbitControls enableZoom={false} enablePan={false} enableRotate={!gameMode} />
            </Canvas>
            <UIOverlay 
              config={config} 
              setConfig={setConfig} 
              models={models} 
              currentModelId={topModel.id} 
              onModelSelect={setTopModel} 
              onDeleteModel={handleDeleteModel} 
              onUpload={handleCustomUpload} 
              gesture={hands[0]?.gesture || GestureType.NONE} 
              handData={hands[0] ? { ...hands[0], burstTrigger: isBursting || isSuperBursting } : null} 
              isFullscreen={isFullscreen} 
              toggleFullscreen={toggleFullscreen} 
              showCamera={showCamera} 
              toggleCamera={() => setShowCamera(!showCamera)} 
              gameMode={gameMode} 
              toggleGameMode={handleToggleGameMode} 
              gameType={gameType}
              setGameType={setGameType}
              score={score} 
              lives={lives} 
              isGameOver={isGameOver} 
              onRestart={() => {setIsGameOver(false); setLives([10, 10]); setScore(0); setPlayerHit([false, false]); setSlowEffectActive(false);}} 
              highScores={[]} 
            />
            {playerHeal.some(h => h) && (
                <div className="absolute inset-0 pointer-events-none bg-green-500/10 animate-pulse z-[60]" />
            )}
            {slowEffectActive && (
                <div className="absolute inset-0 pointer-events-none bg-yellow-500/5 animate-pulse z-[55] flex items-center justify-center">
                    <div className="border border-yellow-500/20 bg-black/40 backdrop-blur-md px-6 py-2 rounded-full flex items-center gap-3 animate-bounce">
                        <Zap size={16} className="text-yellow-400 fill-yellow-400" />
                        <span className="text-yellow-400 font-black tracking-widest text-xs uppercase">全场减速中</span>
                    </div>
                </div>
            )}
        </>
      )}
    </div>
  );
};

export default App;
