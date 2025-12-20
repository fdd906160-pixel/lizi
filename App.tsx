
import React, { useState, useEffect, useRef } from 'react';
import { Canvas, extend } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import Particles from './components/Particles';
import UIOverlay from './components/UIOverlay';
import { SpaceGame } from './components/SpaceGame';
import { initializeHandLandmarker, detectHands } from './services/visionService';
import { startMusic, stopMusic, playHitSound, playGameOverSound } from './services/audioService';
import { HandData, GestureType, ParticleConfig, ImageModel } from './types';
import { MODELS } from './constants';
import { Camera, Loader2, AlertCircle, Video, VideoOff, Gamepad2, Play, Sparkles, Zap, RefreshCw } from 'lucide-react';

extend(THREE as any);

interface HighScore {
  score: number;
  date: string;
}

const App: React.FC = () => {
  const [handData, setHandData] = useState<HandData | null>(null);
  const [models, setModels] = useState<ImageModel[]>(MODELS);
  const [currentModel, setCurrentModel] = useState<ImageModel>(MODELS[0]);
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
  const [isStarted, setIsStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [showCamera, setShowCamera] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gameMode, setGameMode] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [playerHit, setPlayerHit] = useState(false);
  const [highScores, setHighScores] = useState<HighScore[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>(0);
  const lastSwitchTimeRef = useRef<number>(0);
  
  // Refs for physics engine synchronization
  const playerPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const playerScaleRef = useRef<number>(1);

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
    };
  }, []);

  const handleStart = async () => {
    setIsLoading(true);
    try {
      if (!isEngineReady) await initializeHandLandmarker();
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user", width: 640, height: 480 } 
      });
      streamRef.current = stream;
      setIsStarted(true);
    } catch (err: any) {
      setError("Failed to initialize system. Check camera permissions.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
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
        const data = detectHands(videoRef.current, showCamera ? canvasRef.current : null);
        setHandData(data);
        if (data && !gameMode && data.gesture === GestureType.OK_SIGN) {
            if (Date.now() - lastSwitchTimeRef.current > 1500) {
                const idx = models.findIndex(m => m.id === currentModel.id);
                if (models.length > 0) {
                  const nextIdx = (idx + 1) % models.length;
                  setCurrentModel(models[nextIdx]);
                  lastSwitchTimeRef.current = Date.now();
                }
            }
        }
      }
      requestRef.current = requestAnimationFrame(loop);
    };
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isStarted, currentModel, models, gameMode, showCamera]);

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
          const newModel: ImageModel = {
              id: 'custom-' + Date.now(),
              name: file.name,
              src: url,
              type: '3d',
              extension: extension
          };
          setModels(prev => [...prev, newModel]);
          setCurrentModel(newModel);
          setIsImporting(false);
      } else {
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (ev.target?.result) {
              const newModel: ImageModel = {
                id: 'custom-' + Date.now(),
                name: file.name.split('.')[0] || 'Image Import',
                src: ev.target.result as string,
                type: 'image'
              };
              setModels(prev => [...prev, newModel]);
              setCurrentModel(newModel);
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
        if (currentModel.id === id) {
            if (filtered.length > 0) setCurrentModel(filtered[0]);
            else { setCurrentModel(MODELS[0]); return MODELS; }
        }
        return filtered;
    });
  };

  return (
    <div className="relative w-full h-full bg-[#050505] overflow-hidden">
      {!isStarted ? (
        <div className="flex flex-col items-center justify-center h-full text-white text-center px-6">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full" />
              <Zap size={80} className="text-cyan-400 relative animate-pulse" />
            </div>
            <h1 className="text-6xl font-black mb-4 tracking-tighter">IP手势交互</h1>
            <p className="text-gray-500 text-sm max-w-xs mb-10 tracking-widest uppercase font-bold">实时流体内核交互系统</p>
            {error && <p className="text-red-500 mb-6 bg-red-500/10 px-4 py-2 rounded-lg flex items-center gap-2 border border-red-500/20"><AlertCircle size={16}/> {error}</p>}
            <button onClick={handleStart} className="group relative bg-white text-black px-16 py-5 rounded-full font-black text-xl overflow-hidden hover:scale-110 transition-transform active:scale-95 disabled:opacity-50" disabled={isLoading}>
                <div className="absolute inset-0 bg-cyan-500/10 group-hover:translate-x-full transition-transform duration-500 -skew-x-12 -translate-x-full" />
                <span className="relative">{isLoading ? "同步中..." : "初始化系统"}</span>
            </button>
            {!isEngineReady && !isLoading && <p className="mt-4 text-[10px] text-gray-600 animate-pulse">WASM 引擎正在后台加载...</p>}
        </div>
      ) : (
        <>
            {isImporting && (
              <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center">
                 <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="text-cyan-400 animate-spin" size={40} />
                    <span className="text-white text-sm font-bold tracking-widest animate-pulse">正在生成内核...</span>
                 </div>
              </div>
            )}
            <div className={`absolute bottom-6 right-6 w-64 h-48 border-2 border-white/20 rounded-2xl z-50 overflow-hidden shadow-2xl transition-all ${showCamera ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                <video ref={videoRef} className="w-full h-full object-cover" style={{transform: 'scaleX(-1)'}} playsInline muted />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{transform: 'scaleX(-1)'}} />
            </div>
            <Canvas camera={{ position: [0, 0, 150] }} dpr={[1, 1.5]} gl={{ antialias: false, stencil: false, depth: true }} performance={{ min: 0.5 }}>
                <Particles 
                    model={currentModel} 
                    handData={handData} 
                    config={config} 
                    playerPosRef={playerPosRef} 
                    playerScaleRef={playerScaleRef}
                    isHit={playerHit} 
                    isGameOver={isGameOver} 
                    isGameActive={gameMode} 
                />
                <SpaceGame 
                    playerPosRef={playerPosRef} 
                    playerScaleRef={playerScaleRef}
                    isGameActive={gameMode && !isGameOver} 
                    onHit={() => {
                        if (isGameOver || playerHit) return;
                        setLives(prev => {
                            const next = prev - 1;
                            if (next <= 0) {
                                setIsGameOver(true);
                                playGameOverSound();
                                stopMusic();
                            } else {
                                playHitSound();
                            }
                            return next;
                        });
                        setPlayerHit(true);
                        setTimeout(() => setPlayerHit(false), 800);
                    }} 
                    onScore={s => setScore(prev => prev + s)} 
                    score={score} 
                />
                <Environment preset="night" />
                <OrbitControls enableZoom={false} enablePan={false} enableRotate={!gameMode} />
            </Canvas>
            <UIOverlay config={config} setConfig={setConfig} models={models} currentModelId={currentModel.id} onModelSelect={setCurrentModel} onDeleteModel={handleDeleteModel} onUpload={handleCustomUpload} gesture={handData?.gesture || GestureType.NONE} handData={handData} isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen} showCamera={showCamera} toggleCamera={() => setShowCamera(!showCamera)} gameMode={gameMode} toggleGameMode={() => setGameMode(!gameMode)} score={score} lives={lives} isGameOver={isGameOver} onRestart={() => {setIsGameOver(false); setLives(3); setScore(0); setPlayerHit(false);}} highScores={highScores} />
        </>
      )}
    </div>
  );
};

export default App;
