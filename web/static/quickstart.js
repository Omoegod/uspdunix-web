(function () {
  const DEV_LABELS = { electric: 'Электросчётчики', water: 'Счётчики воды' };
  const IFACE_LABELS = { tcp: 'TCP', rfs: 'RFs', rs232: 'RS232', rs485_1: 'RS485-1', rs485_2: 'RS485-2' };
  const PROTO_LABELS = { gss: 'GSS', mbus: 'M-BUS', dlms: 'DLMS' };
  const DLMS_PROFILES = ['NORAX3', 'CLOU1', 'NORAX3_NEW', 'NORAX3_SREZ'];
  const DEFAULT_HDLC = 100;
  const MAX_DEVICES = 399;
  const RF_GROUP_COUNT = 32;
  const RF_GROUP_MASK_ALL = 0xffffffff;
  // Set true to write RouterRF node-0 group mask before nodes (see quickstart.WriteRouterGroupMask).
  const QS_WRITE_ROUTER_GROUP_MASK = false;
  let step = 1;
  let uploadRowId = 0;
  const S7_HINTS = {
    1: 'Выберите готовый шаблон. Дальше — основной RF-модуль, затем назначение групп узлам.',
    2: 'Отметьте группы основного RF-модуля (обычно 1). Без этого на этапе назначения узлы могут подсвечиваться как вне цепочки.',
    3: 'Выделите устройства и назначьте RF-группы. Стыки соседних групп связывают участки в цепочку до основного RF.',
    4: 'Проверьте схему и сводку. Затем нажмите «Записать узлы RFs» внизу страницы.',
  };
  const S7_MAX_SUB = 4;
  const qsState = {
    devices: [],
    endpointsApplied: false,
    rfPlan: null,
    rfNodes: [],
    rfSelected: {},
    rfLastClicked: null,
    step7Sub: 1,
    step7Draft: null,
    rfApplied: false,
    rfRouterMask: 0,
    rfRouterMaskCurrent: 0,
    rfRouterMaskWritten: false,
    rfRouterConfig: null,
  };

  function selected(name) {
    return Array.from(document.querySelectorAll('input[name="' + name + '"]:checked')).map(function (el) { return el.value; });
  }

  function isAutoGroups() {
    const el = document.querySelector('input[name="autoGroups"]:checked');
    return !el || el.value === 'yes';
  }

  function maxStep() {
    return 6;
  }

  function protocolBlockHtml() {
    const protoOpts = Object.keys(PROTO_LABELS).map(function (p) {
      return '<option value="' + p + '">' + PROTO_LABELS[p] + '</option>';
    }).join('');
    const profOpts = DLMS_PROFILES.map(function (p) {
      return '<option value="' + p + '">' + p + '</option>';
    }).join('');
    return (
      '<div class="qs-protocol-block" style="margin-top:8px">' +
      '<label>Протокол</label> <select class="qs-protocol">' + protoOpts + '</select>' +
      '<div class="qs-dlms-fields" style="display:none;margin-top:8px">' +
      '<label>DLMS-профиль</label> <select class="qs-dlms-profile">' + profOpts + '</select> ' +
      '<label>HDLC-адрес</label> <input type="number" class="qs-hdlc-addr" min="1" max="65535" value="' + DEFAULT_HDLC + '" style="width:90px" />' +
      '</div></div>'
    );
  }

  function bindProtocolToggle(scope) {
    scope.querySelectorAll('.qs-protocol').forEach(function (sel) {
      function sync() {
        const host = sel.closest('.qs-upload-row');
        const box = host && host.querySelector('.qs-dlms-fields');
        if (box) box.style.display = sel.value === 'dlms' ? 'block' : 'none';
      }
      sel.addEventListener('change', sync);
      sync();
    });
  }

  function readUploadMeta(container) {
    const protoEl = container.querySelector('.qs-protocol');
    const out = { protocol: protoEl ? protoEl.value : 'gss' };
    if (out.protocol === 'dlms') {
      out.dlms_profile = container.querySelector('.qs-dlms-profile').value;
      out.hdlc_addr = parseInt(container.querySelector('.qs-hdlc-addr').value, 10) || DEFAULT_HDLC;
    }
    return out;
  }

  function defaultProtocolForType(deviceType) {
    return deviceType === 'water' ? 'mbus' : 'gss';
  }

  function addUploadRow(preset) {
    preset = preset || {};
    const area = document.getElementById('qsUploadArea');
    const devTypes = selected('devType');
    const ifaces = selected('iface');
    if (!devTypes.length || !ifaces.length) return null;
    const id = ++uploadRowId;
    const row = document.createElement('div');
    row.className = 'qs-upload-row card';
    const dtOpts = devTypes.map(function (d) { return '<option value="' + d + '">' + DEV_LABELS[d] + '</option>'; }).join('');
    const ifOpts = ifaces.map(function (i) { return '<option value="' + i + '">' + IFACE_LABELS[i] + '</option>'; }).join('');
    row.innerHTML =
      '<label>Тип</label><select class="qs-upload-dt">' + dtOpts + '</select> ' +
      '<label>Интерфейс</label><select class="qs-upload-iface">' + ifOpts + '</select> ' +
      protocolBlockHtml() +
      '<label>Файл</label><input type="file" class="qs-upload-file" accept=".txt,.csv,text/plain" data-field="file_upload_' + id + '" /> ' +
      '<span class="qs-file-info muted"></span> ' +
      '<button type="button" class="btn-danger qs-upload-remove" onclick="qsRemoveUploadRow(this)">Удалить</button>';
    area.appendChild(row);
    const dtSel = row.querySelector('.qs-upload-dt');
    const ifSel = row.querySelector('.qs-upload-iface');
    const protoSel = row.querySelector('.qs-protocol');
    if (preset.deviceType && dtSel) dtSel.value = preset.deviceType;
    if (preset.iface && ifSel) ifSel.value = preset.iface;
    if (protoSel) protoSel.value = defaultProtocolForType(dtSel ? dtSel.value : 'electric');
    bindProtocolToggle(row);
    row.querySelector('.qs-upload-file').addEventListener('change', function (e) { qsUpdateFileInfo(e.target); });
    return row;
  }

  function seedDefaultUploadRows() {
    const devTypes = selected('devType');
    const ifaces = selected('iface');
    devTypes.forEach(function (dt) {
      ifaces.forEach(function (iface) {
        addUploadRow({ deviceType: dt, iface: iface });
      });
    });
  }

  window.qsAddUploadRow = addUploadRow;

  window.qsRemoveUploadRow = function (btn) {
    const area = document.getElementById('qsUploadArea');
    const row = btn.closest('.qs-upload-row');
    if (!area || !row) return;
    row.remove();
    if (!area.querySelector('.qs-upload-row')) {
      seedDefaultUploadRows();
    }
  };

  // Legacy name for template onclick
  window.qsAddManualRow = addUploadRow;

  function renderUploadArea() {
    const area = document.getElementById('qsUploadArea');
    const addBtn = document.getElementById('qsAddUploadRow');
    if (!area) return;
    area.innerHTML = '';
    const devTypes = selected('devType');
    const ifaces = selected('iface');
    if (!devTypes.length || !ifaces.length) {
      area.innerHTML = '<p class="error">Выберите типы устройств и интерфейсы на шагах 1–2.</p>';
      if (addBtn) addBtn.style.display = 'none';
      return;
    }
    if (addBtn) addBtn.style.display = 'inline-block';
    seedDefaultUploadRows();
  }

  function qsUpdateFileInfo(inp) {
    const info = inp.parentElement.querySelector('.qs-file-info');
    if (!inp.files || !inp.files[0]) { info.textContent = ''; return; }
    info.textContent = inp.files[0].name;
  }

  function collectUploads() {
    const uploads = [];
    document.querySelectorAll('#qsUploadArea .qs-upload-row').forEach(function (row) {
      const inp = row.querySelector('.qs-upload-file');
      if (!inp || !inp.files || !inp.files[0]) return;
      const meta = readUploadMeta(row);
      uploads.push(Object.assign({
        device_type: row.querySelector('.qs-upload-dt').value,
        interface: row.querySelector('.qs-upload-iface').value,
        file_field: inp.dataset.field,
      }, meta));
    });
    return uploads;
  }

  function buildFormData() {
    const fd = new FormData();
    fd.append('config', JSON.stringify({
      device_types: selected('devType'),
      interfaces: selected('iface'),
      auto_groups: isAutoGroups(),
      uploads: collectUploads(),
    }));
    document.querySelectorAll('#qsUploadArea .qs-upload-file').forEach(function (inp) {
      if (!inp.files || !inp.files[0]) return;
      const field = inp.dataset.field || inp.getAttribute('data-field');
      fd.append(field, inp.files[0]);
    });
    return fd;
  }

  function rfDevices() {
    return qsState.devices;
  }

  function devicesFingerprint() {
    return qsState.devices.map(function (d) {
      return d.endpoint_index + ':' + d.serial;
    }).join('|');
  }

  function saveStep7Draft() {
    if (!qsState.rfNodes.length || qsState.rfApplied) return;
    const fromEl = document.getElementById('qsRfSelFrom');
    const toEl = document.getElementById('qsRfSelTo');
    qsState.step7Draft = {
      rfNodes: qsState.rfNodes.map(function (n) { return Object.assign({}, n); }),
      rfSelected: Object.assign({}, qsState.rfSelected),
      rfLastClicked: qsState.rfLastClicked,
      step7Sub: qsState.step7Sub,
      selFrom: fromEl ? fromEl.value : '1',
      selTo: toEl ? toEl.value : '1',
      groupBits: selectedRfGroupNumbers(),
      presetGroupCount: getPresetGroupCount(),
      rfRouterMask: qsState.rfRouterMask,
      rfRouterMaskWritten: qsState.rfRouterMaskWritten,
      deviceKey: devicesFingerprint(),
    };
  }

  function getPresetGroupCount() {
    const el = document.getElementById('qsPresetGroupCount');
    if (!el) return 3;
    const v = parseInt(el.value, 10);
    if (isNaN(v)) return 3;
    return Math.max(2, Math.min(RF_GROUP_COUNT, v));
  }

  function step7DraftValid() {
    const d = qsState.step7Draft;
    return !!(d && d.deviceKey === devicesFingerprint() && d.rfNodes && d.rfNodes.length);
  }

  function restoreStep7Draft() {
    if (!step7DraftValid()) return false;
    const d = qsState.step7Draft;
    qsState.rfNodes = d.rfNodes.map(function (n) { return Object.assign({}, n); });
    qsState.rfSelected = Object.assign({}, d.rfSelected || {});
    qsState.rfLastClicked = d.rfLastClicked;
    if (d.step7Sub != null) qsState.step7Sub = d.step7Sub;
    if (d.rfRouterMask != null) qsState.rfRouterMask = d.rfRouterMask >>> 0;
    if (d.rfRouterMaskWritten != null) qsState.rfRouterMaskWritten = !!d.rfRouterMaskWritten;
    return true;
  }

  function applyStep7DraftUi() {
    if (!step7DraftValid()) return;
    const d = qsState.step7Draft;
    const fromEl = document.getElementById('qsRfSelFrom');
    const toEl = document.getElementById('qsRfSelTo');
    if (fromEl && d.selFrom != null) fromEl.value = d.selFrom;
    if (toEl && d.selTo != null) toEl.value = d.selTo;
    if (d.groupBits) setRfGroupBits(d.groupBits);
    const presetEl = document.getElementById('qsPresetGroupCount');
    if (presetEl && d.presetGroupCount != null) presetEl.value = String(d.presetGroupCount);
    updateRfSelCount();
    updateRfGroupsStateText();
  }

  function clearStep7Draft(opts) {
    opts = opts || {};
    qsState.step7Draft = null;
    if (opts.resetSub) qsState.step7Sub = 1;
    if (opts.resetRouterMask) {
      qsState.rfRouterMask = 0;
      qsState.rfRouterMaskCurrent = 0;
      qsState.rfRouterMaskWritten = false;
      qsState.rfRouterConfig = null;
    }
  }

  function getNetNum() {
    const zero = document.querySelector('input[name="subnetZero"]:checked');
    if (zero && zero.value === 'yes') return 0;
    const v = parseInt(document.getElementById('qsNetNum').value, 10);
    return isNaN(v) ? 0 : Math.max(0, Math.min(49, v));
  }

  function getRfConnParams() {
    const hostEl = document.getElementById('qsRfHost');
    const portEl = document.getElementById('qsRfPort');
    const host = hostEl ? String(hostEl.value || '').trim() : '';
    let port = portEl ? parseInt(portEl.value, 10) : 10001;
    if (isNaN(port) || port <= 0) port = 10001;
    return { host: host, port: port };
  }

  function rfPayload() {
    const conn = getRfConnParams();
    const routerMask = qsState.rfRouterMask >>> 0;
    return {
      net_num: getNetNum(),
      devices: qsState.devices,
      node_group_masks: collectNodeGroupMasks(),
      router_group_mask: routerMask,
      set_router_group_mask: routerMask !== 0,
      host: conn.host,
      port: conn.port,
    };
  }

  function groupMaskFromNumbers(nums) {
    let mask = 0;
    nums.forEach(function (g) {
      if (g >= 1 && g <= RF_GROUP_COUNT) mask |= (1 << (g - 1));
    });
    return mask >>> 0;
  }

  function groupMaskHex(mask) {
    return (mask >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  function groupsFromMask(mask) {
    const out = [];
    for (let g = 1; g <= RF_GROUP_COUNT; g++) {
      if ((mask >>> 0) & (1 << (g - 1))) out.push(g);
    }
    return out;
  }

  function formatGroupsShort(mask) {
    const gs = groupsFromMask(mask);
    if (gs.length === RF_GROUP_COUNT) return 'по умолчанию';
    if (gs.length > 6) return gs.slice(0, 5).join(',') + '… (' + gs.length + ')';
    return gs.join(',') || '—';
  }

  function formatGroupsHuman(mask) {
    const m = mask >>> 0;
    if (m === 0) return 'не назначено';
    if (m === RF_GROUP_MASK_ALL) return 'по умолчанию (1–32)';
    const gs = groupsFromMask(m);
    if (gs.length === 1) return 'Группа ' + gs[0];
    if (gs.length <= 5) return 'Группы ' + gs.join('+');
    return 'Группы ' + gs.slice(0, 4).join('+') + '… (' + gs.length + ')';
  }

  function buildGroupAdjFromNodes() {
    const adj = {};
    function ensure(g) {
      if (!adj[g]) adj[g] = {};
    }
    qsState.rfNodes.forEach(function (n) {
      const m = n.group_mask >>> 0;
      if (!m) return;
      const gs = groupsFromMask(m);
      gs.forEach(function (g) { ensure(g); });
      for (let i = 0; i < gs.length; i++) {
        for (let j = i + 1; j < gs.length; j++) {
          adj[gs[i]][gs[j]] = true;
          adj[gs[j]][gs[i]] = true;
        }
      }
    });
    return adj;
  }

  function groupsReachableFromRouter(adj, routerMask) {
    const start = groupsFromMask(routerMask >>> 0);
    const seen = {};
    const queue = [];
    start.forEach(function (g) {
      if (!seen[g]) {
        seen[g] = true;
        queue.push(g);
      }
    });
    while (queue.length) {
      const g = queue.shift();
      const neighbors = adj[g] || {};
      Object.keys(neighbors).forEach(function (k) {
        const n = parseInt(k, 10);
        if (!seen[n]) {
          seen[n] = true;
          queue.push(n);
        }
      });
    }
    return seen;
  }

  // Device is visible to main RF if any of its groups is reachable
  // from RouterRF groups through overlap chain (1+2 → 2+3 → …).
  function nodeNotVisibleToMainRf(mask, reachable) {
    const m = mask >>> 0;
    if (m === 0) return true;
    if (!reachable) {
      reachable = groupsReachableFromRouter(buildGroupAdjFromNodes(), qsState.rfRouterMask);
    }
    const gs = groupsFromMask(m);
    for (let i = 0; i < gs.length; i++) {
      if (reachable[gs[i]]) return false;
    }
    return true;
  }

  function countNodesByGroupMask() {
    const stats = { empty: 0, noMainRf: 0, single: 0, overlap: 0, byGroup: {} };
    for (let g = 1; g <= RF_GROUP_COUNT; g++) stats.byGroup[g] = 0;
    const reachable = groupsReachableFromRouter(buildGroupAdjFromNodes(), qsState.rfRouterMask);
    qsState.rfNodes.forEach(function (n) {
      const m = n.group_mask >>> 0;
      if (m === 0) { stats.empty++; return; }
      const gs = groupsFromMask(m);
      if (gs.length === 1) {
        stats.single++;
        stats.byGroup[gs[0]]++;
      } else {
        stats.overlap++;
      }
      if (nodeNotVisibleToMainRf(m, reachable)) stats.noMainRf++;
    });
    stats.reachableGroups = reachable;
    return stats;
  }

  function validateStep7Groups() {
    const errors = [];
    const warnings = [];
    const stats = countNodesByGroupMask();
    const routerMask = qsState.rfRouterMask >>> 0;

    if (stats.empty) {
      errors.push('У ' + stats.empty + ' устройств не назначена RF-группа.');
    }
    if (!routerMask) {
      warnings.push('Группы основного RF не выбраны — отметьте их на этапе «Основной RF модуль».');
    }
    if (stats.noMainRf) {
      errors.push(
        'У ' + stats.noMainRf + ' устройств нет связи с RouterRF по цепочке групп. ' +
        'Нужны стыки соседних групп (например 1+2, 2+3), чтобы сигнал дошёл до главного RF.'
      );
    }
    if (!QS_WRITE_ROUTER_GROUP_MASK && routerMask) {
      warnings.push('Запись групп основного RF временно отключена — будут записаны только узлы.');
    } else if (!qsState.rfRouterMaskWritten && routerMask) {
      warnings.push('Группы основного RF запишутся вместе с узлами.');
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings, stats: stats };
  }

  function buildGroupGraph() {
    const devicesInGroup = {};
    const edgeSet = {};
    const segments = {};
    qsState.rfNodes.forEach(function (n) {
      const m = n.group_mask >>> 0;
      if (!m) return;
      segments[m] = (segments[m] || 0) + 1;
      const gs = groupsFromMask(m);
      gs.forEach(function (g) {
        devicesInGroup[g] = (devicesInGroup[g] || 0) + 1;
      });
      for (let i = 0; i < gs.length; i++) {
        for (let j = i + 1; j < gs.length; j++) {
          const a = Math.min(gs[i], gs[j]);
          const b = Math.max(gs[i], gs[j]);
          edgeSet[a + '-' + b] = true;
        }
      }
    });
    const routerGroups = groupsFromMask(qsState.rfRouterMask >>> 0);
    routerGroups.forEach(function (g) {
      if (!devicesInGroup[g]) devicesInGroup[g] = 0;
    });
    const groups = Object.keys(devicesInGroup).map(Number).sort(function (a, b) { return a - b; });
    const edges = Object.keys(edgeSet).map(function (k) {
      const p = k.split('-');
      return { a: parseInt(p[0], 10), b: parseInt(p[1], 10) };
    });
    return {
      groups: groups,
      devicesInGroup: devicesInGroup,
      edges: edges,
      routerGroups: routerGroups,
      segments: segments,
    };
  }

  function renderGroupGraphHtml() {
    const g = buildGroupGraph();
    if (!g.groups.length && !g.routerGroups.length) {
      return '<p class="muted">Нет данных для схемы групп.</p>';
    }

    const boxW = 108;
    const boxH = 72;
    const gap = 56;
    const rfW = 100;
    const rfH = 72;
    const padX = 24;
    const padY = 28;
    const rowY = padY + 8;

    const positions = {};
    let x = padX;
    positions.rf = { x: x, y: rowY, w: rfW, h: rfH };
    x += rfW + gap;

    g.groups.forEach(function (num) {
      positions[num] = { x: x, y: rowY, w: boxW, h: boxH };
      x += boxW + gap;
    });

    const width = Math.max(x - gap + padX, 320);
    const height = padY + boxH + 56;

    function center(p) {
      return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    }

    function arrowLine(x1, y1, x2, y2, cls) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      // shorten to box edges roughly
      const shrink = 6;
      const ax1 = x1 + ux * shrink;
      const ay1 = y1 + uy * shrink;
      const ax2 = x2 - ux * shrink;
      const ay2 = y2 - uy * shrink;
      return '<line class="' + cls + '" x1="' + ax1 + '" y1="' + ay1 + '" x2="' + ax2 + '" y2="' + ay2 + '" marker-end="url(#qsArrow)" />';
    }

    let svg = '<svg class="qs-s7-graph-svg" viewBox="0 0 ' + width + ' ' + height + '" width="100%" height="' + height + '" role="img" aria-label="Схема RF-групп">';
    svg += '<defs>' +
      '<marker id="qsArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#64748b"/></marker>' +
      '<marker id="qsArrowRf" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#3b82f6"/></marker>' +
      '</defs>';

    // RF → its groups
    const rfC = center(positions.rf);
    g.routerGroups.forEach(function (num, idx) {
      const p = positions[num];
      if (!p) return;
      const c = center(p);
      if (idx === 0 && g.groups[0] === num) {
        svg += arrowLine(positions.rf.x + positions.rf.w, rfC.y, p.x, c.y, 'qs-s7-link qs-s7-link-rf');
      } else {
        const mx = (rfC.x + c.x) / 2;
        const my = Math.min(rfC.y, c.y) - 22 - idx * 10;
        svg += '<path class="qs-s7-link qs-s7-link-rf" d="M ' + (positions.rf.x + positions.rf.w) + ' ' + rfC.y +
          ' Q ' + mx + ' ' + my + ' ' + p.x + ' ' + c.y + '" fill="none" marker-end="url(#qsArrowRf)" />';
      }
    });

    // Group ↔ group from overlaps
    g.edges.forEach(function (e) {
      const pa = positions[e.a];
      const pb = positions[e.b];
      if (!pa || !pb) return;
      const ca = center(pa);
      const cb = center(pb);
      const adjacent = Math.abs(e.a - e.b) === 1;
      if (adjacent && pa.x < pb.x) {
        svg += arrowLine(pa.x + pa.w, ca.y, pb.x, cb.y, 'qs-s7-link');
      } else {
        // non-adjacent: arc above
        const mx = (ca.x + cb.x) / 2;
        const my = Math.min(ca.y, cb.y) - 28;
        svg += '<path class="qs-s7-link" d="M ' + (pa.x + pa.w) + ' ' + ca.y +
          ' Q ' + mx + ' ' + my + ' ' + pb.x + ' ' + cb.y + '" fill="none" marker-end="url(#qsArrow)" />';
      }
    });

    // RF box
    const rp = positions.rf;
    svg += '<rect class="qs-s7-node qs-s7-node-rf" x="' + rp.x + '" y="' + rp.y + '" width="' + rp.w + '" height="' + rp.h + '" rx="8" />';
    svg += '<text class="qs-s7-node-title qs-s7-node-title-on-dark" x="' + (rp.x + rp.w / 2) + '" y="' + (rp.y + 28) + '" text-anchor="middle">Осн. RF</text>';
    const rfLabel = g.routerGroups.length ? ('гр. ' + g.routerGroups.join('+')) : 'нет групп';
    svg += '<text class="qs-s7-node-sub qs-s7-node-title-on-dark" x="' + (rp.x + rp.w / 2) + '" y="' + (rp.y + 48) + '" text-anchor="middle">' + rfLabel + '</text>';

    // Group boxes
    g.groups.forEach(function (num) {
      const p = positions[num];
      const nDev = g.devicesInGroup[num] || 0;
      const isRouter = g.routerGroups.indexOf(num) >= 0;
      svg += '<rect class="qs-s7-node' + (isRouter ? ' qs-s7-node-entry' : '') + '" x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" rx="8" />';
      svg += '<text class="qs-s7-node-title" x="' + (p.x + p.w / 2) + '" y="' + (p.y + 26) + '" text-anchor="middle">Группа ' + num + '</text>';
      svg += '<text class="qs-s7-node-sub" x="' + (p.x + p.w / 2) + '" y="' + (p.y + 48) + '" text-anchor="middle">' + nDev + ' устр.</text>';
    });

    svg += '</svg>';

    // Segment legend
    const segKeys = Object.keys(g.segments).map(function (k) { return parseInt(k, 10); })
      .sort(function (a, b) { return a - b; });
    let legend = '<div class="qs-s7-graph-legend">';
    if (segKeys.length) {
      legend += '<p class="qs-s7-graph-legend-title">Сегменты устройств</p><ul>';
      segKeys.forEach(function (mask) {
        legend += '<li><strong>' + formatGroupsHuman(mask) + '</strong> — ' + g.segments[mask] + ' устр.</li>';
      });
      legend += '</ul>';
    }
    if (g.edges.length) {
      legend += '<p class="muted" style="font-size:12px;margin-top:8px">Стрелки — стыки групп. Дальние участки (3+4, 4+5…) доходят до RouterRF по цепочке через соседние стыки.</p>';
    }
    legend += '</div>';

    return '<div class="qs-s7-graph">' +
      '<p class="qs-s7-graph-title">Схема групп и связей</p>' +
      '<div class="qs-s7-graph-scroll">' + svg + '</div>' +
      legend +
      '</div>';
  }

  function renderStep7Review() {
    const el = document.getElementById('qsS7Review');
    if (!el) return;
    const v = validateStep7Groups();
    const st = v.stats;
    let html = renderGroupGraphHtml();
    html += '<div class="qs-s7-review-grid">';
    html += '<div class="qs-s7-stat"><strong>' + qsState.rfNodes.length + '</strong><span>устройств</span></div>';
    html += '<div class="qs-s7-stat"><strong>' + st.single + '</strong><span>в одной группе</span></div>';
    html += '<div class="qs-s7-stat"><strong>' + st.overlap + '</strong><span>стыки (2+ группы)</span></div>';
    html += '<div class="qs-s7-stat"><strong>' + st.empty + '</strong><span>без группы</span></div>';
    html += '<div class="qs-s7-stat"><strong>' + st.noMainRf + '</strong><span>вне цепочки RF</span></div>';
    html += '</div>';
    html += '<p style="font-size:13px;margin-top:8px"><strong>Основной RF модуль:</strong> ' +
      formatGroupsHuman(qsState.rfRouterMask) +
      (qsState.rfRouterMaskWritten ? ' — уже записаны' : ' — запишутся вместе с узлами') +
      '</p>';
    if (v.errors.length) {
      html += '<div class="status error qs-s7-review-msg"><ul>';
      v.errors.forEach(function (msg) { html += '<li>' + msg + '</li>'; });
      html += '</ul></div>';
    } else {
      html += '<p class="status ok qs-s7-review-msg">Проверка пройдена — можно записывать узлы в RouterRF.</p>';
    }
    if (v.warnings.length) {
      html += '<div class="status info qs-s7-review-msg"><ul>';
      v.warnings.forEach(function (msg) { html += '<li>' + msg + '</li>'; });
      html += '</ul></div>';
    }
    html += '<p class="muted" style="font-size:12px;margin-top:12px">Маршруты MainRef/AdditRef выставит RouterRF после связывания с главным модулем — вручную их задавать не нужно.</p>';
    el.innerHTML = html;
  }

  function updateS7SideHint() {
    const el = document.getElementById('qsS7SideHint');
    if (el) el.textContent = S7_HINTS[qsState.step7Sub] || '';
  }

  function updateS7LocalNav() {
    const prev = document.getElementById('qsS7Prev');
    const next = document.getElementById('qsS7Next');
    if (prev) prev.disabled = false;
    if (next) {
      next.style.display = qsState.step7Sub < S7_MAX_SUB ? 'inline-block' : 'none';
      if (qsState.step7Sub === 2) next.textContent = 'К назначению →';
      else if (qsState.step7Sub === 3) next.textContent = 'Проверить →';
      else next.textContent = 'Далее →';
    }
  }

  function suggestRouterMaskFromNodes() {
    let mask = 0;
    qsState.rfNodes.forEach(function (n) {
      const m = n.group_mask >>> 0;
      if (m & 1) mask |= m;
    });
    if (!mask) mask = 1;
    return mask >>> 0;
  }

  function setRouterMaskUi(mask) {
    mask = mask >>> 0;
    qsState.rfRouterMask = mask;
    setRfRouterGroupBits(groupsFromMask(mask));
    updateRfRouterGroupsStateText();
  }

  function initRfRouterGroupBits() {
    const box = document.getElementById('qsRfRouterGroupBits');
    if (!box || box.childElementCount) return;
    for (let g = 1; g <= RF_GROUP_COUNT; g++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qs-rf-group-bit';
      btn.textContent = String(g);
      btn.dataset.group = String(g);
      btn.title = 'Группа ' + g;
      btn.addEventListener('click', function () {
        btn.classList.toggle('on');
        const groups = selectedRfRouterGroupNumbers();
        qsState.rfRouterMask = groupMaskFromNumbers(groups);
        qsState.rfRouterMaskWritten = false;
        updateRfRouterGroupBitsUi();
        updateRfRouterGroupsStateText();
        saveStep7Draft();
      });
      box.appendChild(btn);
    }
  }

  function selectedRfRouterGroupNumbers() {
    return Array.from(document.querySelectorAll('#qsRfRouterGroupBits .qs-rf-group-bit.on'))
      .map(function (el) { return parseInt(el.dataset.group, 10); })
      .filter(function (n) { return !isNaN(n); });
  }

  function setRfRouterGroupBits(nums) {
    const set = {};
    (nums || []).forEach(function (n) { set[n] = true; });
    document.querySelectorAll('#qsRfRouterGroupBits .qs-rf-group-bit').forEach(function (btn) {
      const g = parseInt(btn.dataset.group, 10);
      btn.classList.toggle('on', !!set[g]);
    });
    updateRfRouterGroupBitsUi();
  }

  function updateRfRouterGroupBitsUi() {
    document.querySelectorAll('#qsRfRouterGroupBits .qs-rf-group-bit').forEach(function (btn) {
      const on = btn.classList.contains('on');
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.style.background = on ? 'var(--primary)' : '#fff';
      btn.style.color = on ? '#fff' : 'inherit';
      btn.style.borderColor = on ? 'var(--primary)' : 'var(--border)';
    });
  }

  function updateRfRouterGroupsStateText() {
    const el = document.getElementById('qsRfRouterGroupsState');
    if (!el) return;
    const groups = selectedRfRouterGroupNumbers();
    if (!groups.length) {
      el.textContent = 'Группы не выбраны';
      return;
    }
    el.textContent = 'Выбрано: ' + formatGroupsHuman(groupMaskFromNumbers(groups));
  }

  window.qsRfSetRouterMaskGroups = function (nums) {
    setRouterMaskUi(groupMaskFromNumbers(nums || [1]));
    qsState.rfRouterMaskWritten = false;
    saveStep7Draft();
  };

  window.qsRfSuggestRouterMask = function () {
    setRouterMaskUi(suggestRouterMaskFromNodes());
    qsState.rfRouterMaskWritten = false;
    saveStep7Draft();
  };

  window.qsRfReadRouterMask = async function () {
    const status = document.getElementById('qsRfRouterMaskStatus');
    if (status) status.innerHTML = '<p class="status info">Чтение групп RouterRF…</p>';
    if (!await qsEnsureRfConnection({ force: true })) {
      if (status) status.innerHTML = '<p class="error">Нет подключения к RouterRF. Проверьте IP/порт на шаге 5.</p>';
      return false;
    }
    try {
      const r = await fetch('/api/rf/config', { credentials: 'same-origin' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.statusText);
      qsState.rfRouterConfig = d;
      let mask = 0;
      if (d.group_mask_hex) mask = parseInt(d.group_mask_hex, 16) >>> 0;
      qsState.rfRouterMaskCurrent = mask;
      if (!qsState.rfRouterMask) {
        setRouterMaskUi(mask || suggestRouterMaskFromNodes());
      } else {
        setRouterMaskUi(qsState.rfRouterMask);
      }
      if (status) {
        status.innerHTML = '<p class="status ok">На RouterRF сейчас: ' + formatGroupsHuman(mask) + '</p>';
      }
      saveStep7Draft();
      return true;
    } catch (e) {
      if (status) status.innerHTML = '<p class="error">' + e.message + '</p>';
      return false;
    }
  };

  function prepareRouterMaskPane() {
    initRfRouterGroupBits();
    if (!qsState.rfRouterMask) {
      setRouterMaskUi(suggestRouterMaskFromNodes());
    } else {
      setRouterMaskUi(qsState.rfRouterMask);
    }
    qsRfReadRouterMask();
  }

  window.qsS7Go = function (sub) {
    sub = parseInt(sub, 10);
    if (isNaN(sub) || sub < 1 || sub > S7_MAX_SUB) return;
    qsState.step7Sub = sub;
    document.querySelectorAll('.qs-s7-tab').forEach(function (tab) {
      const s = parseInt(tab.dataset.s7, 10);
      tab.classList.toggle('active', s === sub);
    });
    document.querySelectorAll('.qs-s7-pane').forEach(function (pane) {
      pane.classList.remove('active');
    });
    const pane = document.getElementById('qsS7Pane' + sub);
    if (pane) pane.classList.add('active');
    if (sub === 2) prepareRouterMaskPane();
    if (sub === 3) {
      renderRfNodesEditTable();
      updateRfSelCount();
    }
    if (sub === 4) renderStep7Review();
    updateS7SideHint();
    updateS7LocalNav();
    updateNavButtons();
    saveStep7Draft();
  };

  window.qsS7Next = function () {
    if (qsState.step7Sub < S7_MAX_SUB) qsS7Go(qsState.step7Sub + 1);
  };

  window.qsS7Prev = function () {
    if (qsState.step7Sub > 1) qsS7Go(qsState.step7Sub - 1);
    else if (step > 1) showStep(step - 1);
  };

  function applyGroupMaskToAll(mask) {
    qsState.rfNodes.forEach(function (n) {
      n.group_mask = mask >>> 0;
      n.group_mask_hex = groupMaskHex(n.group_mask);
    });
  }

  function presetSegmentMask(groupCount, segIndex) {
    if (segIndex === 1) return (1 << 0) >>> 0;
    if (segIndex === groupCount) {
      return ((1 << (groupCount - 2)) | (1 << (groupCount - 1))) >>> 0;
    }
    return ((1 << (segIndex - 2)) | (1 << (segIndex - 1))) >>> 0;
  }

  window.qsPresetRangeGroups = function () {
    const groupCount = getPresetGroupCount();
    const n = qsState.rfNodes.length;
    if (groupCount < 2 || groupCount > RF_GROUP_COUNT) {
      alert('Укажите число групп от 2 до 32.');
      return;
    }
    if (n < groupCount) {
      alert('Для ' + groupCount + ' групп нужно минимум ' + groupCount + ' устройств (сейчас ' + n + ').');
      return;
    }
    const segSize = Math.floor(n / groupCount);

    for (let seg = 1; seg <= groupCount; seg++) {
      const start = (seg - 1) * segSize + 1;
      const end = seg === groupCount ? n : seg * segSize;
      const mask = presetSegmentMask(groupCount, seg);
      qsState.rfNodes.forEach(function (node) {
        const i = node.node_index;
        if (i >= start && i <= end) {
          node.group_mask = mask;
          node.group_mask_hex = groupMaskHex(mask);
        }
      });
    }
    if (!qsState.rfRouterMask) setRouterMaskUi(1);
    else setRouterMaskUi(qsState.rfRouterMask);
    qsS7Go(2);
  };

  window.qsPresetAllGroup1 = function () {
    if (!qsState.rfNodes.length) return;
    applyGroupMaskToAll(1);
    if (!qsState.rfRouterMask) setRouterMaskUi(1);
    qsS7Go(2);
  };

  window.qsPresetResetGroups = function () {
    if (!qsState.rfNodes.length) return;
    applyGroupMaskToAll(RF_GROUP_MASK_ALL);
    if (!qsState.rfRouterMask) setRouterMaskUi(1);
    qsS7Go(2);
  };

  function updateRfGroupsStateText() {
    const el = document.getElementById('qsRfGroupsState');
    if (!el) return;
    const groups = selectedRfGroupNumbers();
    if (!groups.length) {
      el.textContent = 'не выбраны';
      return;
    }
    const mask = groupMaskFromNumbers(groups);
    el.textContent = 'выбрано: ' + formatGroupsHuman(mask);
  }

  function updateRfGroupBitsUi() {
    document.querySelectorAll('#qsRfGroupBits .qs-rf-group-bit').forEach(function (btn) {
      const on = btn.classList.contains('on');
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.style.background = on ? 'var(--primary)' : '#fff';
      btn.style.color = on ? '#fff' : 'inherit';
      btn.style.borderColor = on ? 'var(--primary)' : 'var(--border)';
    });
    updateRfGroupsStateText();
  }

  function initRfGroupBits() {
    const box = document.getElementById('qsRfGroupBits');
    if (!box || box.childElementCount) return;
    for (let g = 1; g <= RF_GROUP_COUNT; g++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qs-rf-group-bit';
      btn.textContent = String(g);
      btn.dataset.group = String(g);
      btn.title = 'RF-группа ' + g;
      btn.addEventListener('click', function () {
        btn.classList.toggle('on');
        updateRfGroupBitsUi();
      });
      box.appendChild(btn);
    }
    updateRfGroupBitsUi();
  }

  function selectedRfGroupNumbers() {
    return Array.from(document.querySelectorAll('#qsRfGroupBits .qs-rf-group-bit.on'))
      .map(function (el) { return parseInt(el.dataset.group, 10); })
      .filter(function (n) { return !isNaN(n); });
  }

  function setRfGroupBits(nums) {
    const set = {};
    nums.forEach(function (n) { set[n] = true; });
    document.querySelectorAll('#qsRfGroupBits .qs-rf-group-bit').forEach(function (btn) {
      const g = parseInt(btn.dataset.group, 10);
      btn.classList.toggle('on', !!set[g]);
    });
    updateRfGroupBitsUi();
  }

  window.qsRfSelectAllGroups = function () {
    const all = [];
    for (let g = 1; g <= RF_GROUP_COUNT; g++) all.push(g);
    setRfGroupBits(all);
  };

  window.qsRfClearAllGroups = function () {
    setRfGroupBits([]);
  };

  function updateRfSelCount() {
    const el = document.getElementById('qsRfSelCount');
    if (!el) return;
    const n = Object.keys(qsState.rfSelected).filter(function (k) { return qsState.rfSelected[k]; }).length;
    el.textContent = n ? ('выбрано: ' + n) : '';
  }

  function rfNodeCount() {
    return qsState.rfNodes.length;
  }

  function collectNodeGroupMasks() {
    return qsState.rfNodes.map(function (n) { return (n.group_mask >>> 0); });
  }

  function syncRfNodesFromPlan(data) {
    if (!data || !data.nodes) return;
    qsState.rfPlan = data;
    qsState.rfNodes = data.nodes.map(function (n) {
      return Object.assign({}, n, {
        group_mask: (n.group_mask != null ? n.group_mask : RF_GROUP_MASK_ALL) >>> 0,
        group_mask_hex: n.group_mask_hex || groupMaskHex(n.group_mask != null ? n.group_mask : RF_GROUP_MASK_ALL),
      });
    });
  }

  function renderRfNodesEditTable() {
    const el = document.getElementById('qsRfNodesEditTable');
    if (!el) return;
    if (!qsState.rfNodes.length) {
      el.innerHTML = '<p class="muted">Нет узлов — сначала создайте устройства на шаге 4.</p>';
      return;
    }
    let html = '<table><tr><th><input type="checkbox" id="qsRfCheckAll" title="Выделить все" /></th>';
    html += '<th>№</th><th>Заводской №</th><th>NetAdr</th><th>ModID</th><th>Группы</th></tr>';
    const reachable = groupsReachableFromRouter(buildGroupAdjFromNodes(), qsState.rfRouterMask);
    qsState.rfNodes.forEach(function (n, idx) {
      const sel = !!qsState.rfSelected[n.node_index];
      const gm = n.group_mask >>> 0;
      const rowCls = gm === 0 ? ' qs-rf-group-empty' : (nodeNotVisibleToMainRf(gm, reachable) ? ' qs-rf-group-warn' : '');
      html += '<tr class="qs-rf-edit-row' + (sel ? ' qs-rf-row-selected' : '') + rowCls + '" data-idx="' + idx + '" data-node="' + n.node_index + '">';
      html += '<td><input type="checkbox" class="qs-rf-row-check" data-node="' + n.node_index + '"' + (sel ? ' checked' : '') + ' /></td>';
      html += '<td>' + n.node_index + '</td><td>' + n.serial + '</td><td>' + n.net_adr + '</td>';
      html += '<td>' + n.mod_id_hex + '</td>';
      html += '<td>' + formatGroupsHuman(gm) + '</td></tr>';
    });
    html += '</table>';
    el.innerHTML = html;

    let dragActive = false;
    let dragSetTo = true;

    function isSelected(nodeIdx) {
      return !!qsState.rfSelected[nodeIdx];
    }

    function setSelected(nodeIdx, selected) {
      if (selected) qsState.rfSelected[nodeIdx] = true;
      else delete qsState.rfSelected[nodeIdx];
      const row = el.querySelector('tr[data-node="' + nodeIdx + '"]');
      if (row) row.classList.toggle('qs-rf-row-selected', selected);
      const cb = row && row.querySelector('.qs-rf-row-check');
      if (cb) cb.checked = selected;
    }

    function setSelectedRange(a, b, selected) {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      qsState.rfNodes.forEach(function (n) {
        if (n.node_index >= lo && n.node_index <= hi) setSelected(n.node_index, selected);
      });
    }

    function nodeFromEventTarget(t) {
      const row = t && t.closest ? t.closest('tr[data-node]') : null;
      if (!row) return null;
      const v = parseInt(row.dataset.node, 10);
      return isNaN(v) ? null : v;
    }

    function stopDrag() {
      dragActive = false;
    }

    document.addEventListener('mouseup', stopDrag, { once: true });

    const checkAll = document.getElementById('qsRfCheckAll');
    if (checkAll) {
      checkAll.addEventListener('change', function () {
        if (checkAll.checked) qsRfSelectAll(); else qsRfClearSelection();
      });
    }
    el.querySelectorAll('.qs-rf-row-check').forEach(function (cb) {
      cb.addEventListener('change', function () {
        const nodeIdx = parseInt(cb.dataset.node, 10);
        setSelected(nodeIdx, cb.checked);
        updateRfSelCount();
      });
    });

    el.querySelectorAll('tr[data-node]').forEach(function (row) {
      row.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        const nodeIdx = parseInt(row.dataset.node, 10);
        if (isNaN(nodeIdx)) return;

        // Do not toggle twice when clicking directly on checkbox.
        const isCheckbox = e.target && e.target.classList && e.target.classList.contains('qs-rf-row-check');
        if (!isCheckbox) e.preventDefault();

        const last = qsState.rfLastClicked || null;
        if (e.shiftKey && last != null) {
          setSelectedRange(last, nodeIdx, true);
          dragSetTo = true;
        } else {
          const next = !isSelected(nodeIdx);
          setSelected(nodeIdx, next);
          dragSetTo = next;
        }
        qsState.rfLastClicked = nodeIdx;
        dragActive = true;
        updateRfSelCount();
      });

      row.addEventListener('mouseover', function (e) {
        if (!dragActive) return;
        // Only while holding left mouse button.
        if (e.buttons !== 1) return;
        const nodeIdx = parseInt(row.dataset.node, 10);
        if (isNaN(nodeIdx)) return;
        setSelected(nodeIdx, dragSetTo);
        updateRfSelCount();
      });
    });

    updateRfSelCount();
  }

  function selectedRfNodeIndexes() {
    return Object.keys(qsState.rfSelected).map(function (k) { return parseInt(k, 10); }).filter(function (n) { return !isNaN(n); });
  }

  window.qsRfSelectRange = function () {
    const from = parseInt(document.getElementById('qsRfSelFrom').value, 10);
    const to = parseInt(document.getElementById('qsRfSelTo').value, 10);
    if (isNaN(from) || isNaN(to)) return;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    qsState.rfNodes.forEach(function (n) {
      if (n.node_index >= lo && n.node_index <= hi) qsState.rfSelected[n.node_index] = true;
    });
    renderRfNodesEditTable();
  };

  window.qsRfSelectAll = function () {
    qsState.rfNodes.forEach(function (n) { qsState.rfSelected[n.node_index] = true; });
    renderRfNodesEditTable();
  };

  window.qsRfClearSelection = function () {
    qsState.rfSelected = {};
    renderRfNodesEditTable();
  };

  function applyMaskToSelected(mask, mode) {
    const idxs = selectedRfNodeIndexes();
    if (!idxs.length) { alert('Выделите узлы'); return; }
    qsState.rfNodes.forEach(function (n) {
      if (!qsState.rfSelected[n.node_index]) return;
      if (mode === 'add') {
        n.group_mask = ((n.group_mask >>> 0) | (mask >>> 0)) >>> 0;
      } else {
        n.group_mask = mask >>> 0;
      }
      n.group_mask_hex = groupMaskHex(n.group_mask);
    });
  }

  window.qsRfAssignGroups = function (mode) {
    const groups = selectedRfGroupNumbers();
    if (!groups.length) { alert('Выберите хотя бы одну RF-группу (1–32)'); return; }
    applyMaskToSelected(groupMaskFromNumbers(groups), mode || 'set');
    renderRfNodesEditTable();
    saveStep7Draft();
    if (qsState.step7Sub === 4) {
      renderStep7Review();
      updateNavButtons();
    }
  };

  window.qsRfRefreshFromServer = async function () {
    if (!qsState.endpointsApplied || !qsState.rfNodes.length) return;
    try {
      const r = await fetch('/api/quickstart/rf/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rfPayload()),
        credentials: 'same-origin',
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.statusText);
      syncRfNodesFromPlan(d);
      renderRfNodesEditTable();
    } catch (e) {
      alert(e.message);
    }
  };

  function prepareStep7() {
    initRfGroupBits();
    applyStep7DraftUi();
    updateRfGroupBitsUi();
    const n = rfNodeCount();
    const fromEl = document.getElementById('qsRfSelFrom');
    const toEl = document.getElementById('qsRfSelTo');
    if (fromEl && toEl && n > 0) {
      if (parseInt(fromEl.value, 10) < 1) fromEl.value = '1';
      if (parseInt(toEl.value, 10) < 1) toEl.value = String(n);
    }
    const sub = qsState.step7Sub || 1;
    qsS7Go(sub);
  }

  function syncRfMode() {
    const wizard = document.querySelector('.qs-wizard');
    if (wizard) wizard.classList.add('qs-has-rf');
  }

  function setBtnDisplay(id, show) {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? 'inline-block' : 'none';
  }

  function updateNavButtons() {
    const max = maxStep();
    const prev = document.getElementById('qsPrev');
    const onGroupsStep = step === 6;
    if (prev) prev.disabled = step <= 1;
    setBtnDisplay('qsNext', step < max && !onGroupsStep);
    setBtnDisplay('qsEpApply', step === 4 && !qsState.endpointsApplied);
    const v = onGroupsStep ? validateStep7Groups() : { ok: true };
    setBtnDisplay(
      'qsRfApply',
      onGroupsStep && qsState.step7Sub === 4 && rfDevices().length > 0 && !qsState.rfApplied && v.ok
    );
    setBtnDisplay('qsFinish', step === 6 && (qsState.rfApplied || rfDevices().length === 0));
    const s7nav = document.querySelector('.qs-s7-local-nav');
    if (s7nav) s7nav.style.display = onGroupsStep ? 'flex' : 'none';
    if (onGroupsStep) updateS7LocalNav();
  }

  async function qsLoadRfDefaults() {
    const hostEl = document.getElementById('qsRfHost');
    const portEl = document.getElementById('qsRfPort');
    const manual = document.getElementById('qsRfConnManual');
    try {
      const r = await fetch('/api/quickstart/rf/defaults', { credentials: 'same-origin' });
      const d = await r.json();
      if (!r.ok) return;
      if (manual && d.show_conn_ui) {
        manual.style.display = 'flex';
      }
      if (hostEl && !hostEl.value.trim() && d.host) hostEl.value = d.host;
      if (portEl && d.port) portEl.value = String(d.port);
    } catch (_) { /* ignore */ }
  }

  async function qsEnsureRfConnection(opts) {
    opts = opts || {};
    const el = document.getElementById('qsRfConnStatus');
    await qsLoadRfDefaults();
    const conn = getRfConnParams();
    if (opts.force) conn.force = true;
    try {
      const r = await fetch('/api/quickstart/rf/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conn),
        credentials: 'same-origin',
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.statusText);
      if (document.getElementById('qsRfHost') && d.host) {
        document.getElementById('qsRfHost').value = d.host;
      }
      if (document.getElementById('qsRfPort') && d.port) {
        document.getElementById('qsRfPort').value = String(d.port);
      }
      if (el) {
        el.innerHTML = '<p class="status ok">RouterRF: ' + d.host + ':' + d.port + '</p>';
      }
      return true;
    } catch (e) {
      if (el) {
        el.innerHTML = '<p class="error">' + e.message + '</p>' +
          '<p class="muted" style="font-size:12px">Укажите IP/порт RoutDrv маршрутизатора (как в «Настроенное RFs») и нажмите «Подключить».</p>';
      }
      return false;
    }
  }

  window.qsConnectRF = function () {
    return qsEnsureRfConnection({ force: true });
  };

  function showStep(n) {
    if (step === 6 && n !== 6) {
      saveStep7Draft();
    }
    step = n;
    syncRfMode();
    if (n === 4) renderUploadArea();
    document.querySelectorAll('.qs-panel').forEach(function (p) { p.classList.remove('active'); });
    const panel = document.getElementById('qsPanel' + n);
    if (panel) panel.classList.add('active');
    document.querySelectorAll('.qs-step-dot').forEach(function (d) {
      const s = parseInt(d.dataset.step, 10);
      d.classList.toggle('active', s <= n);
      d.classList.toggle('done', s < n);
    });
    updateNavButtons();
    if (n >= 5) qsEnsureRfConnection();
    if (n === 6) {
      const restored = restoreStep7Draft();
      if (!restored && !qsState.rfNodes.length && qsState.endpointsApplied && rfDevices().length) {
        qsRefreshRfNodes().then(function () { prepareStep7(); });
      } else {
        prepareStep7();
      }
    }
  }

  function validateStep(n, opts) {
    opts = opts || {};
    if (n === 1 && !selected('devType').length) { alert('Выберите хотя бы один тип устройств'); return false; }
    if (n === 2 && !selected('iface').length) { alert('Выберите хотя бы один интерфейс'); return false; }
    if (n === 4 && opts.requireUploads && !collectUploads().length) {
      alert('Загрузите хотя бы один файл');
      return false;
    }
    if (n === 4 && opts.requireApplied && !qsState.endpointsApplied) {
      alert('Сначала нажмите «Создать устройства»');
      return false;
    }
    return true;
  }

  window.qsToggleSubnet = function () {
    const zero = document.querySelector('input[name="subnetZero"]:checked');
    document.getElementById('qsSubnetBox').style.display =
      zero && zero.value === 'no' ? 'block' : 'none';
  };

  function planKindLabel(kind) {
    if (kind === 'collector') return 'сборщик (GSS Reader)';
    if (kind === 'file_slot') return 'по файлу';
    return 'по типу';
  }

  function renderPlan(plans) {
    if (!plans || !plans.length) {
      document.getElementById('qsPlanPreview').innerHTML = '<p>Нет данных для групп.</p>';
      return;
    }
    let html = '<table><tr><th>Группа</th><th>Тип</th><th>Интерфейс</th><th>Устройств</th></tr>';
    plans.forEach(function (p) {
      html += '<tr><td>' + p.name + '</td><td>' + planKindLabel(p.kind) + '</td>';
      html += '<td>' + (IFACE_LABELS[p.interface] || p.interface) + '</td><td>' + p.device_count + '</td></tr>';
    });
    html += '</table>';
    document.getElementById('qsPlanPreview').innerHTML = html;
  }

  async function qsRefreshRfNodes() {
    if (!qsState.endpointsApplied) return;
    if (rfDevices().length === 0) {
      qsState.rfNodes = [];
      return;
    }
    if (step7DraftValid()) {
      qsState.rfNodes = qsState.step7Draft.rfNodes.map(function (n) { return Object.assign({}, n); });
      return;
    }
    try {
      const r = await fetch('/api/quickstart/rf/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          net_num: getNetNum(),
          devices: qsState.devices,
          node_group_masks: [],
        }),
        credentials: 'same-origin',
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.statusText);
      syncRfNodesFromPlan(d);
    } catch (e) {
      qsState.rfNodes = [];
      alert(e.message);
    }
  }

  window.qsNext = function () {
    const opts = step === 4 ? { requireApplied: true } : {};
    if (!validateStep(step, opts)) return;
    if (step < maxStep()) showStep(step + 1);
  };

  window.qsPrev = function () {
    if (step === 6 && qsState.step7Sub > 1) {
      qsS7Go(qsState.step7Sub - 1);
      return;
    }
    if (step > 1) showStep(step - 1);
  };

  window.qsApplyEndpoints = async function () {
    if (!validateStep(4, { requireUploads: true })) return;
    if (!confirm('Создать устройства и группы на УСПД?')) return;
    try {
      const r = await fetch('/api/quickstart/apply', { method: 'POST', body: buildFormData(), credentials: 'same-origin' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.statusText);
      qsState.devices = d.devices || [];
      qsState.endpointsApplied = true;
      clearStep7Draft({ resetSub: true, resetRouterMask: true });
      qsState.rfNodes = [];
      qsState.rfSelected = {};
      qsState.rfLastClicked = null;
      qsState.rfApplied = false;
      renderPlan(d.plans);
      syncRfMode();
      const el = document.getElementById('qsEpApplyResult');
      el.style.display = 'block';
      el.innerHTML = '<p class="status ok">Создано устройств: ' + d.endpoints_created + ', групп: ' + d.groups_created + '</p>';
      if (d.collector_bindings && d.collector_bindings.length) {
        d.collector_bindings.forEach(function (b) {
          const fileHint = b.slot_index != null ? ', файл ' + (b.slot_index + 1) : '';
          const mod = b.module === 'ssdu02' ? 'ССДУ-02' : b.module === 'ssdu03' ? 'ССДУ-03' : 'GSS Reader';
          if (b.collector) {
            el.innerHTML += '<p class="muted">' + mod + ': ' + b.collector + ' (' + b.interface + fileHint + ')</p>';
          } else if (b.error) {
            el.innerHTML += '<p class="error">' + mod + ' (' + b.interface + fileHint + '): ' + b.error + '</p>';
          }
        });
      }
      el.innerHTML += '<p class="muted">Устройств для RF-модулей: ' + rfDevices().length + '. Нажмите «Далее» для настройки RouterRF.</p>';
      updateNavButtons();
    } catch (e) {
      alert(e.message);
    }
  };

  window.qsApplyRF = async function () {
    const check = validateStep7Groups();
    if (!check.ok) {
      alert(check.errors.join('\n'));
      qsS7Go(4);
      return;
    }
    const el = document.getElementById('qsRfApplyResult');
    if (el) {
      el.style.display = 'block';
      el.innerHTML = '<p class="status info">Переподключение к RouterRF…</p>';
    }
    if (!await qsEnsureRfConnection({ force: true })) {
      if (el) el.innerHTML = '<p class="error">Не удалось подключиться к RouterRF. Проверьте IP/порт на шаге 5.</p>';
      return;
    }
    if (!confirm(QS_WRITE_ROUTER_GROUP_MASK ? 'Записать группы RouterRF, затем узлы?' : 'Записать узлы в RouterRF?')) {
      if (el) el.style.display = 'none';
      return;
    }

    async function postJSON(url, body) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin',
      });
      const d = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(d.error || r.statusText);
      return d;
    }

    async function writeAll() {
      const conn = getRfConnParams();
      const routerMask = qsState.rfRouterMask >>> 0;
      let maskWritten = false;

      if (QS_WRITE_ROUTER_GROUP_MASK && routerMask) {
        if (el) el.innerHTML = '<p class="status info">1/2 Запись групп RouterRF…</p>';
        await postJSON('/api/quickstart/rf/router-mask', {
          host: conn.host,
          port: conn.port,
          router_group_mask: routerMask,
        });
        maskWritten = true;
        qsState.rfRouterMaskWritten = true;
        qsState.rfRouterMaskCurrent = routerMask;
      }

      if (el) {
        el.innerHTML = '<p class="status info">' +
          (QS_WRITE_ROUTER_GROUP_MASK && routerMask ? '2/2 ' : '') +
          'Запись узлов…</p>';
      }
      const payload = rfPayload();
      payload.set_router_group_mask = false;
      const d = await postJSON('/api/quickstart/rf/apply', payload);
      return { d: d, maskWritten: maskWritten };
    }

    try {
      const res = await writeAll();
      qsState.rfApplied = true;
      clearStep7Draft();
      el.style.display = 'block';
      let okMsg = 'Записано узлов: ' + res.d.nodes_written;
      if (res.maskWritten) {
        okMsg += '. Основной RF: ' + formatGroupsHuman(qsState.rfRouterMask);
      }
      el.innerHTML = '<p class="status ok">' + okMsg + '</p>';
      document.getElementById('qsFinishBox').style.display = 'block';
      syncRfNodesFromPlan(res.d);
      renderRfNodesEditTable();
      updateNavButtons();
    } catch (e) {
      try {
        if (el) el.innerHTML = '<p class="status info">Ошибка записи, повторное подключение…</p>';
        if (!await qsEnsureRfConnection({ force: true })) throw e;
        const res2 = await writeAll();
        qsState.rfApplied = true;
        clearStep7Draft();
        el.style.display = 'block';
        let okMsg2 = 'Записано узлов: ' + res2.d.nodes_written + ' (после переподключения)';
        if (res2.maskWritten) {
          okMsg2 += '. Основной RF: ' + formatGroupsHuman(qsState.rfRouterMask);
        }
        el.innerHTML = '<p class="status ok">' + okMsg2 + '</p>';
        document.getElementById('qsFinishBox').style.display = 'block';
        syncRfNodesFromPlan(res2.d);
        renderRfNodesEditTable();
        updateNavButtons();
      } catch (e2) {
        if (el) {
          el.style.display = 'block';
          el.innerHTML = '<p class="error">' + e2.message + '</p>';
        }
        alert(e2.message);
      }
    }
  };

  function onWizardChoiceChange() {
    syncRfMode();
    if (step === 4) renderUploadArea();
    else showStep(step);
  }

  document.querySelectorAll('input[name="autoGroups"]').forEach(function (el) {
    el.addEventListener('change', onWizardChoiceChange);
  });
  document.querySelectorAll('input[name="devType"], input[name="iface"]').forEach(function (el) {
    el.addEventListener('change', onWizardChoiceChange);
  });

  qsState.rfApplied = false;
  syncRfMode();
  showStep(1);
})();
