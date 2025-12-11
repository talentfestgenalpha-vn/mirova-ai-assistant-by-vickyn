import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  isSpeaking: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, isSpeaking }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particleCount = 150;
    const connectionDistance = 50;
    const baseRadius = 110;

    let time = 0;
    let rotationX = 0;
    let rotationY = 0;
    let pulseIntensity = 0;
    const ripples: { radius: number; alpha: number; speed: number }[] = [];

    interface Particle {
      theta: number;
      phi: number;
      rBase: number;
      size: number;
      phase: number;
    }

    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        theta: Math.random() * Math.PI * 2,
        phi: Math.acos((Math.random() * 2) - 1),
        rBase: baseRadius * (0.8 + Math.random() * 0.4),
        size: Math.random() * 2 + 0.5,
        phase: Math.random() * Math.PI * 2
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      const targetPulse = isSpeaking ? 0.45 : 0.05;
      pulseIntensity += (targetPulse - pulseIntensity) * 0.15;

      const baseSpeed = isActive ? 0.006 : 0.001;
      const speedMult = isSpeaking ? 5 : 1;
      rotationX += baseSpeed * speedMult;
      rotationY += baseSpeed * 0.8 * speedMult;
      time += 0.05;

      if (isSpeaking && Math.random() > 0.8) {
        ripples.push({ radius: baseRadius * 0.5, alpha: 0.6, speed: 4 + Math.random() * 2 });
      }

      ctx.save();
      for (let i = ripples.length - 1; i >= 0; i--) {
        const ripple = ripples[i];
        ripple.radius += ripple.speed;
        ripple.alpha -= 0.01;
        if (ripple.alpha <= 0) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(cx, cy, ripple.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34, 211, 238, ${ripple.alpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      const colorString = isActive ? (isSpeaking ? '34, 211, 238' : '167, 139, 250') : '100, 116, 139';

      const glowSize = 80 + (Math.sin(time * 0.1) * 10) + (pulseIntensity * 140);
      const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, glowSize * 2);
      gradient.addColorStop(0, `rgba(${colorString}, ${isActive ? 0.8 : 0.2})`);
      gradient.addColorStop(0.5, `rgba(${colorString}, ${isActive ? 0.1 : 0.05})`);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, glowSize * 2.5, 0, Math.PI * 2);
      ctx.fill();

      const points: any[] = [];
      particles.forEach(p => {
        const breathing = Math.sin(time * 2 + p.phase) * 6;
        const radiationShock = pulseIntensity * 60 * Math.sin(p.phase * 4 + time * 5);
        const r = p.rBase + breathing + radiationShock;

        const x = r * Math.sin(p.phi) * Math.cos(p.theta);
        const y = r * Math.sin(p.phi) * Math.sin(p.theta);
        const z = r * Math.cos(p.phi);

        const x1 = x * Math.cos(rotationY) - z * Math.sin(rotationY);
        const z1 = x * Math.sin(rotationY) + z * Math.cos(rotationY);
        const y2 = y * Math.cos(rotationX) - z1 * Math.sin(rotationX);
        const z2 = y * Math.sin(rotationX) + z1 * Math.cos(rotationX);

        const fov = 400;
        const scale = fov / (fov + z2);
        const x2D = cx + x1 * scale;
        const y2D = cy + y2 * scale;

        if (scale > 0) {
          points.push({ x: x2D, y: y2D, z: z2, alpha: Math.min(1, Math.max(0.1, (scale - 0.4) + (pulseIntensity * 0.6))) });
        }
      });

      if (isActive) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${colorString}, ${0.15 + pulseIntensity * 0.4})`;
        ctx.lineWidth = 0.5 + pulseIntensity;
        for (let i = 0; i < points.length; i++) {
          for (let j = i + 1; j < Math.min(i + 8, points.length); j++) {
            const dx = points[i].x - points[j].x;
            const dy = points[i].y - points[j].y;
            if (dx * dx + dy * dy < connectionDistance * connectionDistance) {
              ctx.moveTo(points[i].x, points[i].y);
              ctx.lineTo(points[j].x, points[j].y);
            }
          }
        }
        ctx.stroke();
      }

      points.forEach(p => {
        ctx.beginPath();
        ctx.fillStyle = `rgba(${colorString}, ${p.alpha})`;
        const size = (2 + (p.alpha * 3)) * (1 + pulseIntensity);
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      if (isActive) {
        ctx.strokeStyle = `rgba(${colorString}, ${0.25 + pulseIntensity * 0.3})`;
        ctx.lineWidth = 1.5;
        const rs = baseRadius * 1.6 + (pulseIntensity * 40);
        
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(time * 0.2);
        ctx.beginPath();
        ctx.ellipse(0, 0, rs, rs * 0.4, time * 0.1, 0, Math.PI * 2);
        ctx.stroke();

        ctx.rotate(Math.PI / 2 + time * 0.3);
        ctx.beginPath();
        ctx.ellipse(0, 0, rs * 0.9, rs * 0.35, -time * 0.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [isActive, isSpeaking]);

  return (
    <div className="relative w-full h-[500px] flex items-center justify-center pointer-events-none">
      <canvas ref={canvasRef} width={800} height={600} className="w-full h-full object-contain" />
    </div>
  );
};

export default Visualizer;