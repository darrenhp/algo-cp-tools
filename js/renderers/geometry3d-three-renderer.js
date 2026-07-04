/**
 * 三维几何 Three.js 渲染器
 * 依赖 Three.js UMD 全局（window.THREE）与 THREE.OrbitControls。
 * 坐标映射：输入 (x,y,z) 数学惯例 z 向上 → Three.js (x,z,y) Y 向上。
 * 渲染器在容器上持久化 _g3Ctx，避免反复创建 WebGL 上下文。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  // 实体颜色（与 2D 风格统一）
  var COL_POINT = 0x6366f1;     // 点 / 线段 - 靛蓝
  var COL_FACE = 0x16a34a;      // 面 - 绿
  var COL_CUBE = 0xf59e0b;      // 立方体 - 橙
  var COL_SPHERE = 0xa855f7;    // 球体 - 紫
  var COL_AXIS_X = 0xef4444;    // X 轴 - 红
  var COL_AXIS_Y = 0x22c55e;    // Y 轴(竖直=输入z) - 绿
  var COL_AXIS_Z = 0x3b82f6;    // Z 轴(输入y) - 蓝

  /** 输入点 → Three.js 向量（x, z, y 映射，数学 z 向上 → Three Y 向上）。 */
  function toVec3(p) {
    return new THREE.Vector3(p.x, p.z, p.y);
  }

  /** 创建文本标签 Sprite。 */
  function makeLabel(text, color) {
    var canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    var ctx = canvas.getContext('2d');
    ctx.font = 'bold 40px monospace';
    ctx.fillStyle = '#' + (color != null ? color.toString(16).padStart(6, '0') : '475569');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 32);
    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    var sp = new THREE.Sprite(mat);
    sp.scale.set(1.2, 0.6, 1);
    return sp;
  }

  /** dispose 一个 Object3D 子树的所有 geometry/material。 */
  function disposeObject(obj) {
    obj.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) {
          o.material.forEach(function (m) {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      }
    });
  }

  /**
   * 渲染。
   * @param {Geometry3DModel} model
   * @param {HTMLElement} container
   * @param {Object} options { showGrid, showAxes, showIndex, indexBase }
   * @returns {Promise<void>}
   */
  function render(model, container, options) {
    container.innerHTML = '';
    if (!window.THREE) {
      container.innerHTML = '<div class="render-error">Three.js 未加载，请检查网络或 CDN。</div>';
      return Promise.resolve();
    }
    if (!model || model.isEmpty()) {
      container.innerHTML = '<div class="render-error">无几何数据，请输入点/线段/面/立方体后再渲染。</div>';
      return Promise.resolve();
    }
    options = options || {};
    var showGrid = options.showGrid !== false;
    var showAxes = options.showAxes !== false;
    var showIndex = options.showIndex !== false;
    var indexBase = options.indexBase || 0;

    var w = container.clientWidth || 600;
    var h = container.clientHeight || 440;
    if (h < 200) h = 440;

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(w, h);
    renderer.setClearColor(0x0f172a, 1);
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();

    var camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 10000);

    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;

    // 光照
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    var dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(10, 20, 10);
    scene.add(dir);

    // 实体内容组（便于重建时清理）
    var contentGroup = new THREE.Group();
    scene.add(contentGroup);

    var bounds = model.getBounds(1);
    var cx = (bounds.minX + bounds.maxX) / 2;
    var cy = (bounds.minY + bounds.maxY) / 2;
    var cz = (bounds.minZ + bounds.maxZ) / 2;
    // Three 坐标下的中心（x, z, y）
    var center3 = new THREE.Vector3(cx, cz, cy);
    var diag = Math.max(bounds.width, bounds.height, bounds.depth);
    if (diag < 1) diag = 1;

    // ---- 辅助：网格与坐标轴 ----
    if (showGrid) {
      var gridSize = Math.ceil(diag * 2);
      var gridDiv = Math.min(gridSize, 20);
      if (gridDiv < 4) gridDiv = 4;
      var grid = new THREE.GridHelper(gridSize, gridDiv, 0x475569, 0x334155);
      grid.material.transparent = true;
      grid.material.opacity = 0.5;
      // GridHelper 在 XZ 平面（Three Y=0），平移到输入坐标系的 (cx, cy) 即 Three (cx, 0, cy)
      grid.position.set(cx, 0, cy);
      scene.add(grid);
    }
    if (showAxes) {
      var axisLen = diag * 0.9;
      if (axisLen < 1) axisLen = 1;
      // 自定义三色坐标轴（输入 x=红, y=蓝, z=绿(竖直)）
      var axes = new THREE.Group();
      axes.add(makeAxisArrow(new THREE.Vector3(1, 0, 0), COL_AXIS_X, axisLen, 'X'));
      axes.add(makeAxisArrow(new THREE.Vector3(0, 1, 0), COL_AXIS_Y, axisLen, 'Z↑'));
      axes.add(makeAxisArrow(new THREE.Vector3(0, 0, 1), COL_AXIS_Z, axisLen, 'Y'));
      scene.add(axes);
    }

    // ---- 立方体（对角线两端点 → 轴对齐 BoxGeometry） ----
    var pointRadius = Math.max(0.04, diag * 0.018);
    for (var ci = 0; ci < model.cubes.length; ci++) {
      var cube = model.cubes[ci];
      var va = toVec3(cube.a), vb = toVec3(cube.b);
      var size = new THREE.Vector3(
        Math.abs(vb.x - va.x),
        Math.abs(vb.y - va.y),
        Math.abs(vb.z - va.z)
      );
      if (size.x < 1e-6) size.x = 1e-6;
      if (size.y < 1e-6) size.y = 1e-6;
      if (size.z < 1e-6) size.z = 1e-6;
      var center = va.clone().add(vb).multiplyScalar(0.5);
      var geo = new THREE.BoxGeometry(size.x, size.y, size.z);
      var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: COL_CUBE, transparent: true, opacity: 0.12, side: THREE.DoubleSide
      }));
      mesh.position.copy(center);
      contentGroup.add(mesh);
      var edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: COL_CUBE })
      );
      edges.position.copy(center);
      contentGroup.add(edges);
      if (showIndex) {
        var lbl = makeLabel('C#' + (ci + indexBase), COL_CUBE);
        lbl.position.copy(center);
        contentGroup.add(lbl);
      }
    }

    // ---- 面（凸多边形扇形三角化 + 边线 + 半透明填充） ----
    for (var fi = 0; fi < model.faces.length; fi++) {
      var face = model.faces[fi];
      if (face.length < 3) continue;
      var verts = [];
      for (var k = 0; k < face.length; k++) verts.push(toVec3(face[k]));
      // 中心
      var fc = new THREE.Vector3();
      verts.forEach(function (v) { fc.add(v); });
      fc.multiplyScalar(1 / verts.length);

      // 扇形三角化 BufferGeometry
      var positions = [];
      for (var t = 1; t < verts.length - 1; t++) {
        positions.push(verts[0].x, verts[0].y, verts[0].z);
        positions.push(verts[t].x, verts[t].y, verts[t].z);
        positions.push(verts[t + 1].x, verts[t + 1].y, verts[t + 1].z);
      }
      var fgeo = new THREE.BufferGeometry();
      fgeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      fgeo.computeVertexNormals();
      var fmesh = new THREE.Mesh(fgeo, new THREE.MeshBasicMaterial({
        color: COL_FACE, transparent: true, opacity: 0.18, side: THREE.DoubleSide
      }));
      contentGroup.add(fmesh);

      // 边线（闭合）
      var linePts = [];
      for (var e = 0; e < verts.length; e++) {
        linePts.push(verts[e].x, verts[e].y, verts[e].z);
      }
      linePts.push(verts[0].x, verts[0].y, verts[0].z);
      var lgeo = new THREE.BufferGeometry();
      lgeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
      contentGroup.add(new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: COL_FACE })));

      if (showIndex) {
        var flbl = makeLabel('F#' + (fi + indexBase), COL_FACE);
        flbl.position.copy(fc);
        contentGroup.add(flbl);
      }
    }

    // ---- 球体（半透明填充 + 线框） ----
    for (var bi = 0; bi < model.spheres.length; bi++) {
      var sphere = model.spheres[bi];
      var sr = Math.abs(sphere.r);
      if (sr < 1e-6) sr = 1e-6;
      var sc3 = toVec3(sphere.c);
      var sgeo = new THREE.SphereGeometry(sr, 24, 16);
      var smesh = new THREE.Mesh(sgeo, new THREE.MeshBasicMaterial({
        color: COL_SPHERE, transparent: true, opacity: 0.1, side: THREE.DoubleSide
      }));
      smesh.position.copy(sc3);
      contentGroup.add(smesh);
      var swire = new THREE.LineSegments(
        new THREE.WireframeGeometry(sgeo),
        new THREE.LineBasicMaterial({ color: COL_SPHERE, transparent: true, opacity: 0.6 })
      );
      swire.position.copy(sc3);
      contentGroup.add(swire);
      if (showIndex) {
        var blbl = makeLabel('B#' + (bi + indexBase), COL_SPHERE);
        blbl.position.copy(sc3);
        contentGroup.add(blbl);
      }
    }

    // ---- 线段（有向带箭头） ----
    for (var si = 0; si < model.segments.length; si++) {
      var seg = model.segments[si];
      var sa = toVec3(seg.a), sb = toVec3(seg.b);
      var sgeo = new THREE.BufferGeometry().setFromPoints([sa, sb]);
      contentGroup.add(new THREE.Line(sgeo, new THREE.LineBasicMaterial({ color: COL_POINT })));
      if (seg.directed) {
        var dirv = sb.clone().sub(sa);
        var lenv = dirv.length();
        if (lenv > 1e-6) {
          dirv.normalize();
          var arrow = new THREE.ArrowHelper(dirv, sb, 0.0001, COL_POINT, Math.max(0.15, diag * 0.04), Math.max(0.08, diag * 0.02));
          // ArrowHelper 的 dir/origin 已设置，length 极小使 shaft 不显示，仅显示 cone
          contentGroup.add(arrow);
        }
      }
      // 端点小球
      contentGroup.add(makeBall(sa, pointRadius, COL_POINT));
      contentGroup.add(makeBall(sb, pointRadius, COL_POINT));
      if (showIndex) {
        var smid = sa.clone().add(sb).multiplyScalar(0.5);
        var slbl = makeLabel('S#' + (si + indexBase), COL_POINT);
        slbl.position.copy(smid);
        contentGroup.add(slbl);
      }
    }

    // ---- 点（小球 + 序号） ----
    for (var pi = 0; pi < model.points.length; pi++) {
      var pt = toVec3(model.points[pi]);
      contentGroup.add(makeBall(pt, pointRadius * 1.4, COL_POINT));
      if (showIndex) {
        var plbl = makeLabel('#' + (pi + indexBase), 0x475569);
        plbl.position.copy(pt);
        contentGroup.add(plbl);
      }
    }

    // ---- 相机自适应（等比缩放：三轴等比例，不拉伸） ----
    // 相机距离需同时满足水平、垂直视野都能容纳整个包围盒
    var fovRad = camera.fov * Math.PI / 180;
    var halfH = Math.max(bounds.height, bounds.depth) / 2;  // Three 中 Y 对应输入 z
    var halfW = Math.max(bounds.width, bounds.height) / 2;  // Three 中 X/Z 对应输入 x/y
    // 竖直方向所需距离
    var distH = halfH / Math.tan(fovRad / 2);
    // 水平方向所需距离（考虑宽高比）
    var distW = halfW / (Math.tan(fovRad / 2) * camera.aspect);
    var camDist = Math.max(distH, distW) * 1.4;  // 1.4 留余量
    if (camDist < 3) camDist = 3;
    camera.position.set(center3.x + camDist * 0.6, center3.y + camDist * 0.7, center3.z + camDist * 0.6);
    camera.lookAt(center3);
    camera.near = camDist * 0.01;
    camera.far = camDist * 100;
    camera.updateProjectionMatrix();
    controls.target.copy(center3);
    controls.update();

    // 持久化上下文
    var ctx = {
      renderer: renderer,
      scene: scene,
      camera: camera,
      controls: controls,
      contentGroup: contentGroup,
      rafId: null,
      resize: function (nw, nh) {
        if (nw < 10 || nh < 10) return;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      }
    };
    container._g3Ctx = ctx;

    // 渲染循环
    function animate() {
      ctx.rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return Promise.resolve();
  }

  function makeBall(pos, radius, color) {
    var geo = new THREE.SphereGeometry(radius, 16, 12);
    var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color }));
    m.position.copy(pos);
    return m;
  }

  /** 构造一个三色坐标轴箭头（dir 单位向量，颜色，长度，标签文本）。 */
  function makeAxisArrow(dir, color, len, labelText) {
    var g = new THREE.Group();
    var arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), len, color, Math.max(0.12, len * 0.08), Math.max(0.06, len * 0.04));
    g.add(arrow);
    var lbl = makeLabel(labelText, color);
    lbl.position.copy(dir.clone().multiplyScalar(len + 0.3));
    g.add(lbl);
    return g;
  }

  /** 释放容器上的 WebGL 资源。 */
  function dispose(container) {
    var ctx = container._g3Ctx;
    if (!ctx) return;
    if (ctx.rafId) cancelAnimationFrame(ctx.rafId);
    if (ctx.controls) ctx.controls.dispose();
    if (ctx.scene) disposeObject(ctx.scene);
    if (ctx.renderer) ctx.renderer.dispose();
    container._g3Ctx = null;
    container.innerHTML = '';
  }

  /** 触发容器尺寸更新。 */
  function resize(container) {
    var ctx = container._g3Ctx;
    if (!ctx) return;
    var w = container.clientWidth || 600;
    var h = container.clientHeight || 440;
    if (h < 200) h = 440;
    ctx.resize(w, h);
  }

  NS.renderers.geometry3dThreeRenderer = {
    render: render,
    dispose: dispose,
    resize: resize
  };
})();
