// Stage mode, board side (D9, D28). The presenter types the code shown on their phone; nothing scannable is shown.
// The phone answers "paired" once, and from then on the board listens only to that phone. The board mirrors its
// screens inside a phone frame, shows live captions beside it, and plays Bolo's voice for the room.
(() => {
  const BOARD = uid().slice(0, 12);
  let owner = null;
  let player = null;
  let channel = null;
  let hello = null;

  setLang("hi-IN");
  renderHome(); // the phone frame shows Bolo's home screen until the presenter's phone takes over

  // Browsers block sound until someone taps the page, so the board asks for one tap up front
  $("#unlock button").addEventListener("click", () => {
    player = new Audio();
    player.play().catch(() => {});
    $("#unlock").remove();
    $("#code-input").focus();
  });

  if (!Store.online) {
    $("#pair-note").textContent = "Stage mode needs Supabase settings in config.js";
    return;
  }

  $("#code-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = $("#code-input").value.trim().toUpperCase();
    if (code.length !== 4) return;
    if (channel) channel.leave();
    owner = null;
    $("#pair-note").textContent = "Connecting…";
    channel = Store.room(code, onMessage);
    // Keep saying hello: the phone may still be joining, and after a phone reload it re-pairs with this board
    clearInterval(hello);
    const sayHello = () => channel.send({ from: BOARD, type: "board" });
    sayHello();
    hello = setInterval(sayHello, 3000);
    setTimeout(() => { if (!owner) $("#pair-note").textContent = "No phone found with that code. Check it and try again."; }, 8000);
  });

  function onMessage(msg) {
    if (!msg || !msg.from) return;
    if (msg.type === "paired" && msg.to === BOARD && (!owner || owner === msg.from)) {
      owner = msg.from;
      $("#pair").hidden = true;
      $("#live").hidden = false;
      return;
    }
    if (msg.from !== owner) return;
    handle(msg);
  }

  function handle(msg) {
    switch (msg.type) {
      case "status":
        $("#phase").textContent = msg.text || "";
        $("#phase").className = "phase " + (msg.kind || "") + (msg.text ? " on" : "");
        setStatus(msg.text);
        document.body.classList.toggle("recording", msg.kind === "listening");
        break;
      case "building":
        document.body.classList.toggle("building", !!msg.on);
        break;
      case "heard":
        $("#said").textContent = "“" + msg.text + "”";
        $("#said").classList.remove("pop"); void $("#said").offsetWidth; $("#said").classList.add("pop");
        showHeard(msg.text);
        break;
      case "say":
        $("#reply").textContent = msg.text;
        toast(msg.text, "say");
        break;
      case "audio":
        if (player) { player.src = `data:${msg.mime};base64,${msg.audio}`; player.play().catch(() => {}); }
        break;
      case "home":
        state.app = null;
        setLang(msg.lang);
        renderHome();
        break;
      case "app":
        state.app = msg.app; // lets a generated-code app load its saved state on the board
        setLang(msg.app.lang);
        renderApp(view(), msg.app, { readonly: true, assemble: msg.assemble, flash: msg.flash });
        break;
    }
  }
})();
