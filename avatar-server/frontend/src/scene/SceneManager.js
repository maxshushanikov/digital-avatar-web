export async function initScene(canvas, glbPath) {
  try {
    // Динамический импорт Three.js модулей
    const { 
      Scene, PerspectiveCamera, WebGLRenderer, 
      Color, AmbientLight, DirectionalLight,
      Box3, Vector3, AnimationMixer, Clock
    } = await import('three');
    
    const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');

    // Создание рендерера
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Создание сцены
    const scene = new Scene();
    scene.background = new Color(0x202025);
    
    // Создание камеры
    const camera = new PerspectiveCamera(35, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    camera.position.set(0, 1.6, 3);
    
    // Настройка OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);
    
    // Освещение
    scene.add(new AmbientLight(0xffffff, 0.8));
    const dirLight = new DirectionalLight(0xffffff, 1);
    dirLight.position.set(2, 4, 5);
    scene.add(dirLight);
    
    // Загрузка модели аватара
    let avatar = null;
    let mixer = null;
    
    try {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
      
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);
      
      const gltf = await loader.loadAsync(glbPath);
      avatar = gltf.scene;
      
      // Центрирование и масштабирование модели
      const box = new Box3().setFromObject(avatar);
      const size = new Vector3();
      box.getSize(size);
      const center = new Vector3();
      box.getCenter(center);
      
      avatar.position.x -= center.x;
      avatar.position.z -= center.z;
      avatar.position.y -= box.min.y;
      
      const maxDim = Math.max(size.x, size.y, size.z);
      avatar.scale.setScalar(1.5 / maxDim);
      
      controls.target.set(0, size.y / 2, 0);
      controls.update();
      
      scene.add(avatar);
      
      // Настройка анимационного миксера
      mixer = new AnimationMixer(avatar);
      if (gltf.animations && gltf.animations.length) {
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
      }
    } catch (error) {
      console.error('Ошибка загрузки модели:', error);
      showChatMessage(`❌ Ошибка загрузки модели: ${error.message}`, true);
    }
    
    // Обработка изменения размера окна
    function resizeRenderer() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      
      if (canvas.width !== width || canvas.height !== height) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    }
    
    window.addEventListener('resize', resizeRenderer);
    resizeRenderer();
    
    return {
      renderer,
      scene,
      camera,
      controls,
      mixer,
      avatar,
      THREE: {
        Scene, PerspectiveCamera, WebGLRenderer, 
        Color, AmbientLight, DirectionalLight,
        Box3, Vector3, AnimationMixer, Clock
      }
    };
  } catch (error) {
    console.error('Ошибка инициализации сцены:', error);
    throw error;
  }
}

// Вспомогательная функция для показа сообщений в чате
function showChatMessage(message, isError = false) {
  const history = document.getElementById('history');
  if (history) {
    const node = document.createElement('div');
    node.className = 'message assistant';
    if (isError) node.style.color = '#ff6b6b';
    node.textContent = message;
    history.appendChild(node);
    history.scrollTop = history.scrollHeight;
  }
}