(() => {
  const canvas = document.getElementById("network-canvas") || document.createElement("canvas");
  canvas.id = "network-canvas";
  canvas.setAttribute("aria-hidden", "true");

  if (!canvas.isConnected) {
    document.body.prepend(canvas);
  }

  const styles = document.createElement("style");
  styles.textContent = `
    html { background-color: #050507; }
    body { background-color: transparent !important; }
    #network-canvas {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 0;
      display: block;
      pointer-events: none;
    }
    body > :not(#network-canvas):not(script) {
      position: relative;
      z-index: 1;
    }
  `;
  document.head.appendChild(styles);

  const ctx = canvas.getContext("2d");
  let width;
  let height;
  let animationFrame;
  let particles = [];

  const PARTICLE_DENSITY_DIVISOR = 9000;
  const MAX_DISTANCE = 130;
  const MOUSE_RADIUS = 150;
  const MOUSE_REPULSION_FORCE = 0.08;

  const mouse = { x: null, y: null };

  class Particle {
    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.baseVx = (Math.random() - 0.5) * 1.2;
      this.baseVy = (Math.random() - 0.5) * 1.2;
      this.vx = this.baseVx;
      this.vy = this.baseVy;
      this.radius = Math.random() * 1.5 + 1.2;
    }

    update() {
      if (mouse.x !== null && mouse.y !== null) {
        const dx = this.x - mouse.x;
        const dy = this.y - mouse.y;
        const distance = Math.hypot(dx, dy);

        if (distance < MOUSE_RADIUS && distance > 0) {
          const force = (1 - distance / MOUSE_RADIUS) * MOUSE_REPULSION_FORCE;
          const angle = Math.atan2(dy, dx);
          this.vx += Math.cos(angle) * force * 15;
          this.vy += Math.sin(angle) * force * 15;
        }
      }

      this.x += this.vx;
      this.y += this.vy;
      this.vx += (this.baseVx - this.vx) * 0.05;
      this.vy += (this.baseVy - this.vy) * 0.05;

      if (this.x < 0) this.x = width;
      if (this.x > width) this.x = 0;
      if (this.y < 0) this.y = height;
      if (this.y > height) this.y = 0;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fill();
    }
  }

  function initParticles() {
    particles = [];
    const particleCount = Math.floor((width * height) / PARTICLE_DENSITY_DIVISOR);

    for (let i = 0; i < particleCount; i += 1) {
      particles.push(new Particle());
    }
  }

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    initParticles();
  }

  function connectParticles() {
    for (let i = 0; i < particles.length; i += 1) {
      for (let j = i + 1; j < particles.length; j += 1) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const distance = Math.hypot(dx, dy);

        if (distance < MAX_DISTANCE) {
          const alpha = (1 - distance / MAX_DISTANCE) * 0.35;
          ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    particles.forEach((particle) => {
      particle.update();
      particle.draw();
    });

    connectParticles();
    animationFrame = window.requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  document.documentElement.addEventListener("mouseleave", () => {
    mouse.x = null;
    mouse.y = null;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.cancelAnimationFrame(animationFrame);
    } else {
      animate();
    }
  });

  resize();
  animate();
})();
