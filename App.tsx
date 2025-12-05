import React, { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import Particles from './components/Particles';
import UIOverlay from './components/UIOverlay';
import { initializeHandLandmarker, detectHands } from './services/visionService';
import { HandData, GestureType, ParticleConfig, ImageModel } from './types';
import { MODELS } from './constants';
import { Camera, Loader2, AlertCircle, Video, VideoOff } from 'lucide-react';

const App: React.FC = () => {
  // State
  const [handData, setHandData] = useState<HandData | null>(null);
  const [models, setModels] = useState<ImageModel[]>(MODELS);
  const [currentModel, setCurrentModel] = useState<ImageModel>(MODELS[0]);
  const [config, setConfig] = useState<ParticleConfig>({
    color1: '#00ffff',
    color2: '#ff00ff',
    gradientType: 'radial',
    size: 0.25,
    useDepth: false, // Default to 2D
    depthIntensity: 30 // Default depth scale
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>(0);
  const lastGestureRef = useRef<GestureType>(GestureType.NONE);
  const gestureTimerRef = useRef<number>(0);
  const lastSwitchTimeRef = useRef<number>(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (streamRef.current) {
         streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Initialize and attach video stream when App enters "Started" mode and video element is ready
  useEffect(() => {
    if (isStarted && videoRef.current && streamRef.current) {
        const video = videoRef.current;
        video.srcObject = streamRef.current;
        
        const playVideo = async () => {
            try {
                await video.play();
                console.log("Video playing successfully");
            } catch (e) {
                console.error("Error playing video:", e);
                setError("Failed to play video stream. Please check permissions.");
            }
        };

        // Attempt to play immediately or wait for metadata
        if (video.readyState >= 1) {
            playVideo();
        } else {
            video.onloadedmetadata = playVideo;
        }
    }
  }, [isStarted]);

  const handleStart = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // 1. Initialize Vision AI
      console.log("Initializing HandLandmarker...");
      await initializeHandLandmarker();
      
      // 2. Request Camera Permission (Must be triggered by user gesture)
      console.log("Requesting camera...");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: 640, 
          height: 480,
          frameRate: { ideal: 30 }
        } 
      });
      
      console.log("Camera access granted");
      streamRef.current = stream;
      
      // 3. Switch State to render Main App (and Video Element)
      setIsStarted(true);
    } catch (err: any) {
      console.error("Error starting app:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
         setError("Camera access denied. Please allow camera permissions in your browser settings and reload.");
      } else if (err.name === 'NotFoundError') {
         setError("No camera device found. Please connect a camera.");
      } else {
         setError(`Initialization failed: ${err.message || "Unknown error"}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchToModel = (index: number) => {
      if (index >= 0 && index < models.length) {
          if (currentModel.id !== models[index].id) {
              setCurrentModel(models[index]);
          }
      }
  };

  // Frame Loop for Hand Detection
  useEffect(() => {
    if (!isStarted) return;

    const loop = () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        // Pass canvas ref for drawing skeleton
        const data = detectHands(videoRef.current, canvasRef.current);
        setHandData(data);

        // Handle Model Switching via Gesture
        if (data) {
            const gesture = data.gesture;
            
            // Cycle Model Logic (OK Sign)
            if (gesture === GestureType.OK_SIGN) {
                const now = Date.now();
                // 1.5 second debounce for cycling to prevent skipping
                if (now - lastSwitchTimeRef.current > 1500) {
                    const currentIndex = models.findIndex(m => m.id === currentModel.id);
                    const nextIndex = (currentIndex + 1) % models.length;
                    switchToModel(nextIndex);
                    lastSwitchTimeRef.current = now;
                }
            }
            
            lastGestureRef.current = gesture;
        }
      }
      requestRef.current = requestAnimationFrame(loop);
    };
    
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [isStarted, currentModel, models]);

  const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          const newModel: ImageModel = {
            id: 'custom-' + Date.now(),
            name: 'Custom',
            src: ev.target.result as string
          };
          setModels(prev => [...prev, newModel]);
          setCurrentModel(newModel);
          // Auto-enable 3D for uploads as they are often photos
          setConfig(prev => ({...prev, useDepth: true}));
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleDeleteModel = (id: string) => {
    setModels(prev => {
        const nextModels = prev.filter(m => m.id !== id);
        if (currentModel.id === id && nextModels.length > 0) {
            setCurrentModel(nextModels[0]);
        }
        return nextModels;
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((e) => console.log(e));
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((e) => console.log(e));
        setIsFullscreen(false);
      }
    }
  };

  // --- Render Intro Screen if not started ---
  if (!isStarted) {
    return (
        <div className="relative w-full h-full bg-[#050505] flex flex-col items-center justify-center text-white overflow-hidden">
             {/* Background Decoration */}
             <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20 pointer-events-none">
                 <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-cyan-500 rounded-full blur-[120px] animate-pulse"></div>
                 <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500 rounded-full blur-[120px] animate-pulse" style={{animationDelay: '1s'}}></div>
             </div>

             <div className="z-10 max-w-md w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center">
                 <h1 className="text-5xl font-black tracking-tighter mb-2 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                     MORPH<span className="text-white">3D</span>
                 </h1>
                 <p className="text-gray-400 mb-8 font-light">Interactive Hand-Controlled Particle System</p>

                 {error && (
                    <div className="w-full mb-6 bg-red-500/20 border border-red-500/50 p-4 rounded-xl flex items-start gap-3 text-red-200 text-left animate-fade-in">
                        <AlertCircle size={20} className="shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-bold">Error</p>
                            <p className="text-xs opacity-90">{error}</p>
                        </div>
                    </div>
                )}

                 <button 
                    onClick={handleStart}
                    disabled={isLoading}
                    className="w-full group relative overflow-hidden bg-white text-black font-bold py-4 px-6 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
                 >
                     <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-purple-400 opacity-0 group-hover:opacity-10 transition-opacity"></div>
                     <div className="flex items-center justify-center gap-3">
                         {isLoading ? (
                             <>
                                 <Loader2 className="animate-spin" />
                                 <span>Initializing System...</span>
                             </>
                         ) : (
                             <>
                                 <Camera size={20} />
                                 <span>Enable Camera & Start</span>
                             </>
                         )}
                     </div>
                 </button>
                 
                 <div className="mt-6 flex flex-col gap-2 text-xs text-gray-500">
                    <p>Camera access is required for hand tracking.</p>
                    <p>All processing happens locally on your device.</p>
                 </div>
             </div>
        </div>
    );
  }

  // --- Render Main App ---
  return (
    <div className="relative w-full h-full bg-[#050505] overflow-hidden">
      {/* Video Preview & Skeleton Overlay */}
      <div 
        className={`absolute bottom-6 right-6 w-64 h-48 bg-black/80 rounded-2xl border-2 border-white/10 shadow-2xl transition-all duration-500 ease-in-out z-50 overflow-hidden ${showCamera ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}
      >
          {/* Video Element */}
          <video 
            ref={videoRef} 
            className="w-full h-full object-cover opacity-50"
            style={{ transform: 'scaleX(-1)' }} 
            playsInline 
            muted 
          />
          {/* Canvas for Skeleton Overlay */}
          <canvas 
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ transform: 'scaleX(-1)' }}
          />
      </div>

      {/* 3D Scene */}
      <Canvas 
        camera={{ position: [0, 0, 150], fov: 60 }}
        gl={{ antialias: false, toneMapping: 0 }} // Performance settings
        className="touch-none"
      >
        <color attach="background" args={['#050505']} />
        
        {/* Lights */}
        <ambientLight intensity={0.5} />
        <pointLight position={[100, 100, 100]} intensity={1} color="#ffffff" />
        <pointLight position={[-100, -100, 50]} intensity={2} color={config.color1} />

        {/* Particles */}
        <Particles 
          imageSrc={currentModel.src} 
          handData={handData} 
          config={config}
        />

        {/* Post Processing / Environment */}
        <Environment preset="city" />
        <OrbitControls 
          enableZoom={true} 
          enablePan={true} 
          enableRotate={true}
        />
      </Canvas>

      {/* UI Layer */}
      <UIOverlay 
        config={config} 
        setConfig={setConfig}
        models={models}
        currentModelId={currentModel.id}
        onModelSelect={setCurrentModel}
        onDeleteModel={handleDeleteModel}
        onUpload={handleCustomUpload}
        gesture={handData?.gesture || GestureType.NONE}
        handData={handData}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        showCamera={showCamera}
        toggleCamera={() => setShowCamera(!showCamera)}
      />
    </div>
  );
};

export default App;