// Import Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAvbSpDQkwlL6aoLo7KZg7EFc58xFpLREA",
  authDomain: "impostor-af8a1.firebaseapp.com",
  projectId: "impostor-af8a1",
  storageBucket: "impostor-af8a1.firebasestorage.app",
  messagingSenderId: "407393203103",
  appId: "1:407393203103:web:27e43cf3a0244d826fc3aa"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let playerId = Math.random().toString(36).substring(2, 9);
let lobbyId = null;
let words = [];
let voted = false;
let lastState = null;
let isHost = false; // zmienna hosta

// Load words
async function loadWords() {
  const response = await fetch("words.json");
  words = await response.json();
}
loadWords();

// Generate lobby code
function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// CREATE LOBBY
window.createLobby = async function() {
  const name = document.getElementById("name").value;
  if (!name) return alert("Wpisz nick!");

  const code = generateCode();
  lobbyId = code;
  isHost = true; // twórca lobby jest hostem

  await setDoc(doc(db, "lobbies", code), {
    creatorId: playerId,
    players: [{ id: playerId, name, alive: true, wins: 0, losses: 0 }],
    state: "waiting",
    votes: {}
  });

  alert("Kod lobby: " + code);
  listenLobby();
  updateHostButtons();
};

// JOIN LOBBY
window.joinLobby = async function() {
  const name = document.getElementById("name").value;
  const code = document.getElementById("code").value;
  if (!name || !code) return alert("Wpisz nick i kod lobby!");

  const ref = doc(db, "lobbies", code);
  const snap = await getDoc(ref);
  if (!snap.exists()) return alert("Lobby nie istnieje");

  const data = snap.data();
  if (!data.players.some(p => p.id === playerId)) {
    data.players.push({ id: playerId, name, alive: true, wins: 0, losses: 0 });
    await updateDoc(ref, { players: data.players });
  }

  lobbyId = code;
  isHost = data.creatorId === playerId;
  listenLobby();
  updateHostButtons();
};

// VOTE
window.vote = async function(targetId) {
  if (voted) return alert("Już głosowałeś!");

  const ref = doc(db, "lobbies", lobbyId);
  const snap = await getDoc(ref);
  const data = snap.data();

  const me = data.players.find(p => p.id === playerId);
  if (!me.alive) return alert("Jesteś wyeliminowany!");

  voted = true;
  if (!data.votes) data.votes = {};
  data.votes[playerId] = targetId;

  await updateDoc(ref, { votes: data.votes });
};

// TABLE
function renderPlayersTable(data) {
  const tbody = document.querySelector("#playersTable tbody");
  tbody.innerHTML = "";

  data.players.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name}</td>
      <td class="${p.alive ? 'alive' : 'dead'}">${p.alive ? 'Żywy' : 'Eliminowany'}</td>
      <td>W: ${p.wins || 0} / L: ${p.losses || 0}</td>
      <td>
        ${
          data.state !== "playing"
            ? "-"
            : p.id === playerId
              ? (voted ? "✔ Zagłosowałeś" : "Ty")
              : (!p.alive
                  ? "-"
                  : (voted
                      ? "⏳ Czekanie..."
                      : `<button onclick="vote('${p.id}')">Głosuj</button>`))
        }
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// OBSŁUGA HOST BUTTONÓW
function updateHostButtons() {
  const startBtn = document.querySelector('button[onclick="startGame()"]');
  const nextBtn = document.getElementById("nextRoundBtn");

  if (isHost) {
    // START gry widoczny tylko jeśli stan 'waiting'
    startBtn.style.display = lastState === "waiting" ? "inline-block" : "none";
    // Next Round tylko jeśli 'ended'
    nextBtn.style.display = lastState === "ended" ? "inline-block" : "none";
  } else {
    startBtn.style.display = "none";
    nextBtn.style.display = "none";
  }
}

// LISTENER LOBBY
function listenLobby() {
  const ref = doc(db, "lobbies", lobbyId);

  onSnapshot(ref, async (snap) => {
    const data = snap.data();
    if (!data) return;

    const gameDiv = document.getElementById("game");
    const resultDiv = document.getElementById("roundResult");

    // reset voted przy zmianie stanu
    if (lastState !== data.state) {
      if (data.state === "playing") voted = false;
      lastState = data.state;
    }

    isHost = data.creatorId === playerId;
    updateHostButtons();

    resultDiv.innerHTML = "";

    if (data.state === "playing" && data.impostorId) {
      let message = "";

      if (playerId === data.impostorId) {
        message += "<p>Jesteś IMPOSTOREM!</p>";
        message += `<div class="word-box">Hint: ${data.hint}</div>`;
      } else {
        message += "<p>Nie jesteś impostorem</p>";
        message += `<div class="word-box">${data.word}</div>`;
      }

      if (voted) {
        message += `<p style="margin-top:10px; color: #aaa;">
          ⏳ Oczekiwanie na głosy innych graczy...
        </p>`;
      }

      gameDiv.innerHTML = message;

      renderPlayersTable(data);

      const alivePlayers = data.players.filter(p => p.alive);
      const voteCount = data.votes ? Object.keys(data.votes).length : 0;

      if (voteCount === alivePlayers.length && alivePlayers.length > 0) {
        const counts = {};
        Object.values(data.votes).forEach(v => counts[v] = (counts[v] || 0) + 1);
        const maxVotes = Math.max(...Object.values(counts));
        const votedOutId = Object.keys(counts).find(id => counts[id] === maxVotes);

        const newPlayers = data.players.map(p => { if (p.id === votedOutId) p.alive = false; return p; });
        let roundMessage = "";

        if (votedOutId === data.impostorId) {
          roundMessage = "Gracze wygrali!";
          newPlayers.forEach(p => p.id === data.impostorId ? p.losses++ : p.wins++);
        } else {
          roundMessage = "Impostor wygrał!";
          newPlayers.forEach(p => p.id === data.impostorId ? p.wins++ : p.losses++);
        }

        await updateDoc(ref, { players: newPlayers, votes: {}, state: "ended" });
        resultDiv.innerHTML = `<div class="result-box">${roundMessage}</div>`;
        updateHostButtons();
      }
    }

    if (data.state === "waiting") {
      const playersList = data.players.map(p => p.name).join(", ");
      gameDiv.innerHTML = `<h2>Gracze: ${playersList}</h2>`;
      renderPlayersTable(data);
    }

    if (data.state === "ended") renderPlayersTable(data);
  });
}

// START ROUND
async function startRound(players) {
  const resetPlayers = players.map(p => ({ ...p, alive: true }));
  const impostor = resetPlayers[Math.floor(Math.random() * resetPlayers.length)];
  const randomWord = words[Math.floor(Math.random() * words.length)];

  await updateDoc(doc(db, "lobbies", lobbyId), {
    players: resetPlayers,
    state: "playing",
    impostorId: impostor.id,
    word: randomWord.word,
    hint: randomWord.hint,
    votes: {}
  });
}

// START GAME
window.startGame = async function() {
  const ref = doc(db, "lobbies", lobbyId);
  const snap = await getDoc(ref);
  const data = snap.data();
  if (!data || data.players.length < 2) return alert("Za mało graczy lub brak lobby!");

  voted = false;
  document.getElementById("nextRoundBtn").style.display = "none";

  await startRound(data.players);
};

// NEXT ROUND
window.nextRound = async function() {
  const ref = doc(db, "lobbies", lobbyId);
  const snap = await getDoc(ref);
  const data = snap.data();
  if (!data || data.players.length < 2) return alert("Za mało graczy!");

  voted = false;
  document.getElementById("nextRoundBtn").style.display = "none";

  const preservedStats = data.players.map(p => ({ id: p.id, name: p.name, wins: p.wins, losses: p.losses }));
  await startRound(preservedStats);
};