// Where apps live. Supabase when configured (D15), with a copy in this browser as a cache and offline fallback.
// Apps are fetched only by their unguessable id through two database functions, so nobody can list them.
const Store = (() => {
  const cfg = window.BOLO_CONFIG || {};
  const sb = cfg.supabaseUrl && cfg.supabaseKey && window.supabase
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;

  const local = {
    get: (id) => { try { return JSON.parse(localStorage.getItem("bolo.app." + id)); } catch { return null; } },
    put: (app) => { try { localStorage.setItem("bolo.app." + app.id, JSON.stringify(app)); } catch {} },
  };

  function recent() {
    try { return JSON.parse(localStorage.getItem("bolo.apps")) || []; } catch { return []; }
  }

  function remember(app) {
    const list = recent().filter((a) => a.id !== app.id);
    list.unshift({ id: app.id, title: app.spec.title, lang: app.lang, mode: app.spec.mode, icon: app.spec.icon, color: app.spec.color });
    try { localStorage.setItem("bolo.apps", JSON.stringify(list.slice(0, 30))); } catch {}
  }

  async function get(id) {
    if (sb) {
      try {
        const { data, error } = await sb.rpc("get_app", { p_id: id });
        const row = Array.isArray(data) ? data[0] : data;
        if (!error && row && row.spec) {
          const app = { id: row.id, spec: row.spec, rows: row.rows, versions: row.versions || [], lang: row.lang };
          local.put(app);
          return app;
        }
      } catch {}
    }
    return local.get(id);
  }

  const timers = {};
  function put(app) {
    local.put(app);
    remember(app);
    if (!sb) return;
    // Entries can arrive quickly one after another; send each app's latest state once things settle
    clearTimeout(timers[app.id]);
    timers[app.id] = setTimeout(() => {
      sb.rpc("save_app", { p_id: app.id, p_spec: app.spec, p_rows: app.rows, p_versions: app.versions, p_lang: app.lang })
        .then(({ error }) => error && console.warn("save failed", error.message));
    }, 400);
  }

  // Live channel between the presenter's phone and the smart board (stage mode, D9)
  function room(code, onEvent) {
    if (!sb) return null;
    const ch = sb.channel("bolo-" + code, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "bolo" }, ({ payload }) => onEvent && onEvent(payload));
    // Messages sent before the channel is joined would be lost, so hold them until it is
    let ready = false;
    const queue = [];
    const push = (payload) => ch.send({ type: "broadcast", event: "bolo", payload });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") { ready = true; queue.splice(0).forEach(push); }
    });
    return { send: (payload) => (ready ? push(payload) : queue.push(payload)), leave: () => sb.removeChannel(ch) };
  }

  return { get, put, recent, room, online: !!sb };
})();
