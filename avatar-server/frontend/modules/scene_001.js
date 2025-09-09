// modules/scene.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/DRACOLoader.js';

export async function initScene(canvas, glbPath) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  resizeRenderer();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202025);

  const camera = new THREE.PerspectiveCamera(35, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(0, 1.6, 3);

  // Свет
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(2, 4, 5);
  scene.add(dirLight);

  // Проверка доступности файла перед загрузкой
  try {
    const headResp = await fetch(glbPath, { method: 'HEAD' });
    if (!headResp.ok) {
      showChatError(`Ошибка: модель ${glbPath} не найдена (HTTP ${headResp.status})`);
      console.error(`GLB-файл не найден: ${glbPath}`);
      return { renderer, scene, camera, mixer: null, avatar: null, THREE };
    }
  } catch (err) {
    showChatError(`Ошибка сети при загрузке модели: ${err.message}`);
    console.error("Ошибка сети при HEAD-запросе:", err);
    return { renderer, scene, camera, mixer: null, avatar: null, THREE };
  }

  console.log("Загружаем модель:", glbPath);

  // DRACO loader
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  let gltf;
  try {
    gltf = await loader.loadAsync(glbPath);
    console.log("Модель загружена:", gltf);
  } catch (err) {
    showChatError(`Ошибка при загрузке модели: ${err.message}`);
    console.error("Ошибка GLTFLoader:", err);
    return { renderer, scene, camera, mixer: null, avatar: null, THREE };
  }

  const avatar = gltf.scene;
  avatar.traverse(o => { o.frustumCulled = false; });

  // Автоцентрирование и масштаб
  const box = new THREE.Box3().setFromObject(avatar);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  avatar.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scaleFactor = 1.5 / maxDim;
  avatar.scale.setScalar(scaleFactor);

  scene.add(avatar);

  const mixer = new THREE.AnimationMixer(avatar);
  if (gltf.animations && gltf.animations.length) {
    const act = mixer.clipAction(gltf.animations[0]);
    act.play();
  }

  const clock = new THREE.Clock();
  function render() {
    requestAnimationFrame(render);
    const dt = clock.getDelta();
    mixer.update(dt);
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

// Функция для вывода ошибки в чат
function showChatError(message) {
  const history = document.getElementById('history');
  if (history) {
    const node = document.createElement('div');
    node.className = 'message assistant';
    node.style.color = 'red';
    node.textContent = message;
    history.appendChild(node);
    node.scrollIntoView({ behavior: 'smooth', block: 'end' });
  } else {
    alert(message);
  }
}