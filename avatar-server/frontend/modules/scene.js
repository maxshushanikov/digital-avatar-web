// digital_avatar/avatar-server/frontend/modules/scene.js
import * as THREE from 'three';
import {
   GLTFLoader
} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
   DRACOLoader
} from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
   OrbitControls
} from 'three/examples/jsm/controls/OrbitControls.js';

export async function initScene(canvas, glbPath) {
   console.log('🎯 initScene вызван с путём:', glbPath);

   const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
   });
   renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

   const scene = new THREE.Scene();
   scene.background = new THREE.Color(0x202025);

   // Камера
   const camera = new THREE.PerspectiveCamera(35, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
   camera.position.set(0, 1.6, 3);

   // OrbitControls
   const controls = new OrbitControls(camera, renderer.domElement);
   controls.enableDamping = true;
   controls.target.set(0, 1, 0);

   resizeRenderer();
   window.addEventListener('resize', resizeRenderer);

   // Свет
   scene.add(new THREE.AmbientLight(0xffffff, 0.8));
   const dirLight = new THREE.DirectionalLight(0xffffff, 1);
   dirLight.position.set(2, 4, 5);
   scene.add(dirLight);

   let avatar = null;
   let mixer = null;

   // Проверка наличия файла
   let fileExists = false;
   try {
      const resp = await fetch(glbPath, {
         method: 'HEAD'
      });
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
      try {
         const dracoLoader = new DRACOLoader();
         dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

         const loader = new GLTFLoader();
         loader.setDRACOLoader(dracoLoader);

         console.log('📦 Загружаем GLB...');
         const gltf = await loader.loadAsync(glbPath);
         console.log('✅ Модель загружена:', gltf);

         avatar = gltf.scene;
         avatar.traverse(o => {
            o.frustumCulled = false;
         });

         // Центрирование и масштаб
         const box = new THREE.Box3().setFromObject(avatar);
         const size = new THREE.Vector3();
         box.getSize(size);
         const center = new THREE.Vector3();
         box.getCenter(center);

         // Центрируем по X и Z, но оставляем низ модели на "полу"
         avatar.position.x -= center.x;
         avatar.position.z -= center.z;
         avatar.position.y -= box.min.y; // поднимаем так, чтобы низ модели был на Y=0

         // Масштабируем
         const maxDim = Math.max(size.x, size.y, size.z);
         avatar.scale.setScalar(1.5 / maxDim);

         // Обновляем точку, куда смотрит камера
         controls.target.set(0, size.y / 2, 0);
         controls.update();

         console.log(`📏 Размер модели: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
         showChatMessage(`📏 Размер модели: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);

         scene.add(avatar);

         mixer = new THREE.AnimationMixer(avatar);
         if (gltf.animations && gltf.animations.length) {
            const act = mixer.clipAction(gltf.animations[0]);
            act.play();
         }
      } catch (err) {
         console.error('❌ Ошибка загрузки GLB:', err);
         showChatMessage(`❌ Ошибка загрузки GLB: ${err.message}`, true);
      }
   }

   // Рендер
   const clock = new THREE.Clock();

   function render() {
      requestAnimationFrame(render);
      const dt = clock.getDelta();
      if (mixer) mixer.update(dt);
      controls.update();
      renderer.render(scene, camera);
   }
   render();

   function resizeRenderer() {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
   }

   return {
      renderer,
      scene,
      camera,
      mixer,
      avatar,
      THREE
   };
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
      node.scrollIntoView({
         behavior: 'smooth',
         block: 'end'
      });
   } else {
      console.log(message);
   }
}