// modules/scene.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export async function initScene(canvas, glbPath) {
  console.log('🎯 initScene вызван с путём:', glbPath);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202025);

  // Сначала создаём камеру
  const camera = new THREE.PerspectiveCamera(35, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(0, 1.6, 3);
  
  // OrbitControls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // плавность
  controls.target.set(0, 1, 0);  // куда смотрим по умолчанию

  // Теперь можно вызывать resizeRenderer
  resizeRenderer();
  window.addEventListener('resize', resizeRenderer);

  // Свет
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(2, 4, 5);
  scene.add(dirLight);

  let avatar = null;
  let mixer = null;
  let rotateCube = null;

  // 1. Проверка наличия файла
  let fileExists = false;
  try {
    const resp = await fetch(glbPath, { method: 'HEAD' });
    fileExists = resp.ok;
    if (fileExists) {
      console.log(`✅ Модель найдена: ${glbPath}`);
      showChatMessage(`✅ Модель найдена: ${glbPath}`);
    } else {
      console.warn(`❌ Модель не найдена: ${glbPath} (HTTP ${resp.status})`);
      showChatMessage(`❌ Модель не найдена: ${glbPath} (HTTP ${resp.status})`, true);
    }
  } catch (err) {
    console.error(`⚠ Ошибка при проверке модели: ${err.message}`);
    showChatMessage(`⚠ Ошибка при проверке модели: ${err.message}`, true);
  }

  if (fileExists) {
    // 2. Загружаем модель
    try {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);

      console.log('📦 Загружаем GLB...');
      const gltf = await loader.loadAsync(glbPath);
      console.log('✅ Модель загружена:', gltf);

      avatar = gltf.scene;
      avatar.traverse(o => { o.frustumCulled = false; });

      // === ОТЛАДКА ===
      const helperAxes = new THREE.AxesHelper(1.5);
      scene.add(helperAxes);

      avatar.traverse(o => {
        if (o.isMesh) {
          o.material = new THREE.MeshNormalMaterial();
        }
      });

      const box = new THREE.Box3().setFromObject(avatar);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      avatar.position.sub(center);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scaleFactor = 1.5 / maxDim;
      avatar.scale.setScalar(scaleFactor);

      const boxHelper = new THREE.Box3Helper(box, 0xffff00);
      scene.add(boxHelper);

      console.log(`📏 Размер модели: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
      showChatMessage(`📏 Размер модели: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
      // === КОНЕЦ ОТЛАДКИ ===

      scene.add(avatar);

      mixer = new THREE.AnimationMixer(avatar);
      if (gltf.animations && gltf.animations.length) {
        const act = mixer.clipAction(gltf.animations[0]);
        act.play();
      }
    } catch (err) {
      console.error("❌ Ошибка загрузки GLB:", err);
      showChatMessage(`❌ Ошибка загрузки GLB: ${err.message}`, true);
      rotateCube = addRotatingCube(scene);
    }
  } else {
    // 3. Файл не найден — подставляем куб
    rotateCube = addRotatingCube(scene);
  }

  // Рендер
  const clock = new THREE.Clock();
  function render() {
    requestAnimationFrame(render);
    const dt = clock.getDelta();
    if (mixer) mixer.update(dt);
    if (rotateCube) {
      rotateCube.rotation.x += 0.01;
      rotateCube.rotation.y += 0.01;
      rotateCube.scale.setScalar(1 + 0.1 * Math.sin(Date.now() * 0.005)); // пульсация
    }
    renderer.render(scene, camera);
  }
  render();

  window.addEventListener('resize', resizeRenderer);
  function resizeRenderer() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return { renderer, scene, camera, mixer, avatar, THREE };
}

// Вывод сообщений в чат
function showChatMessage(message, isError = false) {
  const history = document.getElementById('history');
  if (history) {
    const node = document.createElement('div');
    node.className = 'message assistant';
    if (isError) node.style.color = 'red';
    node.textContent = message;
    history.appendChild(node);
    node.scrollIntoView({ behavior: 'smooth', block: 'end' });
  } else {
    console.log(message);
  }
}

// Добавление вращающегося куба
function addRotatingCube(scene) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);
  console.log("🟩 Добавлен вращающийся куб вместо аватара");
  showChatMessage("🟩 Добавлен вращающийся куб вместо аватара");
  return cube;
}