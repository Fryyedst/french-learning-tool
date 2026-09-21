const DAILY_NEW_COUNT = 10;
const ROUNDS_PER_WORD = 3;
const OPTION_COUNT = 4;
const STORAGE_KEY = "french-vocab-progress-v4";
const STORAGE_VERSION = 4;
const ACCENTS = ["é", "è", "ê", "à", "ç", "ô", "û", "î", "œ", "ù", "â", "ï", "ë", "ü"];

const screenStart = document.querySelector("#screen-start");
const screenQuiz = document.querySelector("#screen-quiz");
const screenResult = document.querySelector("#screen-result");
const screenEmpty = document.querySelector("#screen-empty");
const screenHistory = document.querySelector("#screen-history");
const learnButton = document.querySelector("#learn-button");
const reviewButton = document.querySelector("#review-button");
const historyButton = document.querySelector("#history-button");
const historyHomeButton = document.querySelector("#history-home-button");
const historyList = document.querySelector("#history-list");
const homeStatus = document.querySelector("#home-status");
const dailySentenceFr = document.querySelector("#daily-sentence-fr");
const dailySentenceZh = document.querySelector("#daily-sentence-zh");
const restartButton = document.querySelector("#restart-button");
const homeButton = document.querySelector("#home-button");
const emptyHomeButton = document.querySelector("#empty-home-button");
const nextButton = document.querySelector("#next-button");
const optionsContainer = document.querySelector("#options");
const questionCount = document.querySelector("#question-count");
const progressBar = document.querySelector("#progress-bar");
const scoreText = document.querySelector("#score-text");
const stageBadge = document.querySelector("#stage-badge");
const correctMark = document.querySelector("#correct-mark");
const wordDots = document.querySelector("#word-dots");
const choicePrompt = document.querySelector("#choice-prompt");
const sentencePrompt = document.querySelector("#sentence-prompt");
const fillPrompt = document.querySelector("#fill-prompt");
const questionArea = document.querySelector(".question-area");
const frenchWord = document.querySelector("#french-word");
const sentenceFr = document.querySelector("#sentence-fr");
const fillChinese = document.querySelector("#fill-chinese");
const blankedWord = document.querySelector("#blanked-word");
const fillForm = document.querySelector("#fill-form");
const fillInput = document.querySelector("#fill-input");
const fillSubmit = document.querySelector("#fill-submit");
const accentButtons = document.querySelector("#accent-buttons");
const feedback = document.querySelector("#feedback");
const speakButton = document.querySelector("#speak-button");
const speechStatus = document.querySelector("#speech-status");
const resultTitle = document.querySelector("#result-title");
const resultScore = document.querySelector("#result-score");
const resultTotal = document.querySelector("#result-total");
const resultMessage = document.querySelector("#result-message");
const resultSummary = document.querySelector("#result-summary");
const emptyTitle = document.querySelector("#screen-empty h1");
const emptyMessage = document.querySelector("#empty-message");

const wordByFrench = new Map(WORDS.map((word) => [word.french, word]));
const poolsByLevelAndPos = new Map();

for (const word of WORDS) {
  const key = `${word.level}|${word.pos}`;
  if (!poolsByLevelAndPos.has(key)) poolsByLevelAndPos.set(key, []);
  poolsByLevelAndPos.get(key).push(word);
}

let store = loadStore();
let activeSession = null;
let currentWord = null;
let currentTask = null;
let currentOptions = [];
let answered = false;
let frenchVoice = null;
let speechVersion = 0;

function createDefaultStore() {
  return { version: STORAGE_VERSION, seenWords: [], days: {}, reviews: {}, history: [] };
}

function loadStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === STORAGE_VERSION) return saved;
  } catch (error) {
    console.warn("Unable to read learning progress", error);
  }
  return createDefaultStore();
}

function saveStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn("Unable to save learning progress", error);
    homeStatus.textContent = "浏览器无法保存进度，请检查隐私设置。";
  }
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function yesterdayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

function sentenceForDate(date = new Date()) {
  const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const index = ((dayNumber % DAILY_SENTENCES.length) + DAILY_SENTENCES.length) % DAILY_SENTENCES.length;
  return DAILY_SENTENCES[index];
}

function isSpeechSupported() {
  return "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

function updateFrenchVoice() {
  if (!isSpeechSupported()) return;
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("fr"));
  frenchVoice = voices.find((voice) => voice.lang.toLowerCase() === "fr-fr") || voices[0] || null;
}

function speakText(text) {
  if (!text || !isSpeechSupported()) return;
  window.speechSynthesis.cancel();
  const version = ++speechVersion;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fr-FR";
  utterance.rate = 0.82;
  if (frenchVoice) utterance.voice = frenchVoice;
  utterance.onend = () => {
    if (version === speechVersion) speechStatus.textContent = "";
  };
  utterance.onerror = () => {
    if (version === speechVersion) speechStatus.textContent = "暂时无法播放，请检查系统语音设置";
  };
  speechStatus.textContent = "正在播放法语发音";
  window.speechSynthesis.speak(utterance);
}

function stopSpeech() {
  if (!isSpeechSupported()) return;
  speechVersion += 1;
  window.speechSynthesis.cancel();
}

function showScreen(screen, name) {
  [screenStart, screenQuiz, screenResult, screenEmpty, screenHistory].forEach((item) => {
    item.hidden = true;
    item.classList.remove("screen--active");
  });
  document.body.dataset.screen = name;
  screen.hidden = false;
  screen.classList.add("screen--active");
}

function sessionWordObjects(session) {
  return session.words.map((wordId) => wordByFrench.get(wordId)).filter(Boolean);
}

function getProgress(session, wordId) {
  return session.progress?.[wordId] || 0;
}

function renderDots(value) {
  [...wordDots.children].forEach((dot, index) => {
    dot.classList.toggle("dot--on", index < value);
  });
}

function createSession(type, words, sourceDate = null) {
  return {
    id: `${type}-${dateKey()}-${Date.now()}`,
    type,
    sourceDate,
    words,
    progress: Object.fromEntries(words.map((wordId) => [wordId, 0])),
    successfulTasks: 0,
    current: null,
    lastWordId: null,
    stage: "rounds",
    fillQueue: [],
    historyAdded: false,
    createdAt: new Date().toISOString()
  };
}

function openSession(session) {
  activeSession = session;
  answered = false;
  currentOptions = [];
  if (session.stage === "done") {
    showSessionResult();
    return;
  }
  showScreen(screenQuiz, "quiz");
  renderQuestion();
}

function startLearnSession() {
  stopSpeech();
  const today = dateKey();
  if (!store.days[today]) store.days[today] = { batches: [] };

  const incomplete = store.days[today].batches.find((batch) => batch.stage !== "done");
  if (incomplete) {
    openSession(incomplete);
    return;
  }

  const seen = new Set(store.seenWords);
  const available = WORDS.filter((word) => !seen.has(word.french));
  if (!available.length) {
    showEmpty("新词已全部学完", "3,000 个 B2 单词都已经学习过了。");
    return;
  }

  const words = shuffle(available).slice(0, DAILY_NEW_COUNT).map((word) => word.french);
  const session = createSession("learn", words);
  store.days[today].batches.push(session);
  store.seenWords.push(...words);
  saveStore();
  openSession(session);
}

function startReviewSession(reset = false) {
  stopSpeech();
  const today = dateKey();
  const sourceDate = yesterdayKey();
  const existing = store.reviews[today];

  if (existing && !reset) {
    openSession(existing);
    return;
  }

  const words = [...new Set((store.days[sourceDate]?.batches || []).flatMap((batch) => batch.words))];
  if (!words.length) {
    showEmpty("昨天没有学习单词", "先完成今天的新单词学习，明天就可以在这里复习了。");
    return;
  }

  const session = createSession("review", words, sourceDate);
  store.reviews[today] = session;
  saveStore();
  openSession(session);
}

function showEmpty(title, message) {
  stopSpeech();
  emptyTitle.textContent = title;
  emptyMessage.textContent = message;
  showScreen(screenEmpty, "empty");
}

function chooseNextTask(session) {
  const eligible = session.words.filter((wordId) => getProgress(session, wordId) < ROUNDS_PER_WORD);
  if (!eligible.length) return null;

  const spaced = eligible.filter((wordId) => wordId !== session.lastWordId);
  const pool = spaced.length ? spaced : eligible;
  const wordId = pool[Math.floor(Math.random() * pool.length)];
  return { wordId, stage: getProgress(session, wordId) + 1 };
}

function ensureCurrentTask(session) {
  if (
    session.current &&
    getProgress(session, session.current.wordId) === session.current.stage - 1
  ) {
    return session.current;
  }
  session.current = chooseNextTask(session);
  saveStore();
  return session.current;
}

function renderQuestion() {
  const session = activeSession;
  if (!session) return;
  if (session.stage === "rounds") renderRoundQuestion();
  else if (session.stage === "fill") renderFillQuestion();
  else showSessionResult();
}

function choiceDistractors(word) {
  const selected = [];
  const usedSenses = new Set([word.sense]);
  const usedValues = new Set([word.french, word.chinese]);

  const addFromPool = (pool) => {
    for (const candidate of shuffle(pool || [])) {
      if (selected.length >= OPTION_COUNT - 1) return;
      if (usedSenses.has(candidate.sense) || usedValues.has(candidate.french)) continue;
      selected.push(candidate);
      usedSenses.add(candidate.sense);
      usedValues.add(candidate.french);
    }
  };

  addFromPool(poolsByLevelAndPos.get(`${word.level}|${word.pos}`));
  addFromPool(WORDS);
  return selected.slice(0, OPTION_COUNT - 1);
}

function blankExample(word) {
  const sentence = EXAMPLES[word.french] || `Le mot « ${word.french} » apparaît dans cette phrase.`;
  const pattern = new RegExp(word.french.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return sentence.replace(pattern, "_____");
}

function setRoundPrompt(task, word) {
  const stage = task.stage;
  choicePrompt.hidden = false;
  sentencePrompt.hidden = true;
  fillPrompt.hidden = true;
  frenchWord.classList.remove("word--hidden");

  if (stage === 1) {
    choicePrompt.querySelector(".question-label").textContent = "它的中文意思是？";
    frenchWord.textContent = word.french;
    stageBadge.textContent = "第一轮 · 看词选义";
  } else if (stage === 2) {
    choicePrompt.querySelector(".question-label").textContent = "听发音，选择正确的中文意思";
    frenchWord.textContent = "••••••";
    frenchWord.classList.add("word--hidden");
    stageBadge.textContent = "第二轮 · 听音选义";
  } else {
    choicePrompt.hidden = true;
    sentencePrompt.hidden = false;
    sentenceFr.textContent = blankExample(word);
    stageBadge.textContent = "第三轮 · 句子选词";
  }
}

function renderRoundQuestion() {
  const session = activeSession;
  const task = ensureCurrentTask(session);
  if (!task) {
    startFillStage();
    return;
  }

  currentTask = task;
  currentWord = wordByFrench.get(task.wordId);
  answered = false;
  correctMark.hidden = true;
  feedback.textContent = "";
  feedback.className = "feedback";
  speechStatus.textContent = "";
  nextButton.hidden = true;
  optionsContainer.hidden = false;
  fillForm.hidden = true;
  fillInput.disabled = false;
  fillSubmit.disabled = false;
  fillInput.value = "";
  renderDots(getProgress(session, currentWord.french));
  setRoundPrompt(task, currentWord);

  const totalTasks = session.words.length * ROUNDS_PER_WORD;
  questionCount.textContent = `随机练习 · ${session.successfulTasks + 1} / ${totalTasks}`;
  scoreText.textContent = detailsForStage(task.stage);
  progressBar.style.width = `${(session.successfulTasks / totalTasks) * 100}%`;

  const optionValuesAreFrench = task.stage === 3;
  currentOptions = shuffle([currentWord, ...choiceDistractors(currentWord)]);
  optionsContainer.replaceChildren();

  currentOptions.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-button";
    button.dataset.optionIndex = String(index);

    const optionIndex = document.createElement("span");
    optionIndex.className = "option-index";
    optionIndex.textContent = String.fromCharCode(65 + index);

    const optionCopy = document.createElement("span");
    optionCopy.className = "option-copy";
    const primary = document.createElement("span");
    primary.className = "option-primary";
    primary.textContent = optionValuesAreFrench ? option.french : option.chinese;
    const reveal = document.createElement("span");
    reveal.className = "option-translation";
    reveal.textContent = optionValuesAreFrench ? option.chinese : option.french;
    reveal.setAttribute("aria-hidden", "true");
    optionCopy.append(primary, reveal);
    button.append(optionIndex, optionCopy);
    button.addEventListener("click", () => selectRoundAnswer(button, index));
    optionsContainer.append(button);
  });

  requestAnimationFrame(() => questionArea.scrollIntoView({ behavior: "smooth", block: "center" }));
  speakText(task.stage === 3 ? EXAMPLES[currentWord.french] : currentWord.french);
}

function detailsForStage(stage) {
  if (stage === 1) return "看词选义 · 正确后点亮第 1 个绿点";
  if (stage === 2) return "听音选义 · 正确后点亮第 2 个绿点";
  return "句子选词 · 正确后点亮第 3 个绿点";
}

function selectRoundAnswer(selectedButton, selectedIndex) {
  if (answered) return;
  answered = true;

  const session = activeSession;
  const selectedWord = currentOptions[selectedIndex];
  const isCorrect = selectedWord.french === currentWord.french;
  const before = getProgress(session, currentWord.french);

  if (isCorrect) {
    session.progress[currentWord.french] = before + 1;
    session.successfulTasks += 1;
    renderDots(before + 1);
  } else {
    session.progress[currentWord.french] = 0;
    renderDots(0);
    session.lastWordId = currentWord.french;
    session.current = null;
  }
  saveStore();

  const revealFrench = currentTask.stage === 3 ? currentWord.chinese : currentWord.french;
  optionsContainer.querySelectorAll(".option-button").forEach((button) => {
    const option = currentOptions[Number(button.dataset.optionIndex)];
    button.disabled = true;
    button.querySelector(".option-translation").classList.add("option-translation--visible");
    button.querySelector(".option-translation").setAttribute("aria-hidden", "false");
    if (option.french === currentWord.french) button.classList.add("option-button--correct");
    else if (button === selectedButton) button.classList.add("option-button--wrong");
  });

  if (currentTask.stage === 3) sentenceFr.textContent = EXAMPLES[currentWord.french];

  feedback.textContent = isCorrect
    ? `回答正确，第 ${before + 1} 个绿点已点亮。`
    : `回答错误，三个绿点已清零；这个单词之后会从第一轮重新开始。正确答案是“${revealFrench}”。`;
  feedback.classList.add(isCorrect ? "feedback--correct" : "feedback--wrong");
  correctMark.hidden = !isCorrect;

  const allTasksDone = session.successfulTasks === session.words.length * ROUNDS_PER_WORD;
  nextButton.innerHTML = isCorrect && allTasksDone
    ? '进入填空练习 <span aria-hidden="true">→</span>'
    : '下一题 <span aria-hidden="true">→</span>';
  nextButton.hidden = false;
  nextButton.focus();
}

function advanceRoundQueue() {
  const session = activeSession;
  if (session.successfulTasks === session.words.length * ROUNDS_PER_WORD) {
    startFillStage();
    return;
  }
  session.lastWordId = currentWord.french;
  session.current = null;
  saveStore();
  renderQuestion();
}

function startFillStage() {
  const session = activeSession;
  session.stage = "fill";
  session.current = null;
  session.fillQueue = shuffle(session.words);
  saveStore();
  renderQuestion();
}

function createBlankedWord(word) {
  const characters = [...word];
  const letterIndexes = characters
    .map((character, index) => (/\p{L}/u.test(character) ? index : -1))
    .filter((index) => index >= 0);
  const blankCount = Math.min(3, Math.max(1, Math.ceil(letterIndexes.length / 4)));
  const blankIndexes = new Set(shuffle(letterIndexes).slice(0, blankCount));
  return characters.map((character, index) => blankIndexes.has(index) ? "_" : character).join("");
}

function renderFillQuestion() {
  const session = activeSession;
  currentWord = wordByFrench.get(session.fillQueue[0]);
  if (!currentWord) {
    finishSession();
    return;
  }

  answered = false;
  correctMark.hidden = true;
  feedback.textContent = "";
  feedback.className = "feedback";
  speechStatus.textContent = "";
  nextButton.hidden = true;
  choicePrompt.hidden = true;
  sentencePrompt.hidden = true;
  fillPrompt.hidden = false;
  optionsContainer.hidden = true;
  fillForm.hidden = false;
  fillInput.disabled = false;
  fillSubmit.disabled = false;
  fillInput.value = "";
  blankedWord.textContent = createBlankedWord(currentWord.french);
  fillChinese.textContent = currentWord.chinese;
  stageBadge.textContent = "填空练习 · 不影响绿点";
  renderDots(ROUNDS_PER_WORD);

  const total = session.words.length;
  const remaining = session.fillQueue.length;
  questionCount.textContent = `挖字母填空 · 剩余 ${remaining} 个`;
  scoreText.textContent = "三个绿点已完成，拼写答错不影响绿点";
  progressBar.style.width = `${((total - remaining) / total) * 100}%`;

  requestAnimationFrame(() => {
    questionArea.scrollIntoView({ behavior: "smooth", block: "center" });
    fillInput.focus({ preventScroll: true });
  });
  speakText(currentWord.french);
}

function normalizeTypedWord(value) {
  return value.normalize("NFC").replace(/[’]/g, "'").trim().toLowerCase();
}

function submitFillAnswer() {
  if (answered) return;
  answered = true;
  const session = activeSession;
  const isCorrect = normalizeTypedWord(fillInput.value) === normalizeTypedWord(currentWord.french);
  session.lastFillCorrect = isCorrect;
  fillInput.disabled = true;
  fillSubmit.disabled = true;
  blankedWord.textContent = currentWord.french;
  correctMark.hidden = !isCorrect;
  saveStore();

  feedback.textContent = isCorrect
    ? `拼写正确！${currentWord.french} 的意思是“${currentWord.chinese}”。`
    : `拼写错误。正确写法是“${currentWord.french}”，这道题会稍后再次出现。`;
  feedback.classList.add(isCorrect ? "feedback--correct" : "feedback--wrong");

  nextButton.innerHTML = isCorrect && session.fillQueue.length === 1
    ? '完成本组 <span aria-hidden="true">→</span>'
    : '下一题 <span aria-hidden="true">→</span>';
  nextButton.hidden = false;
  nextButton.focus();
}

function advanceFillQueue() {
  const session = activeSession;
  const completed = session.fillQueue.shift();
  if (!session.lastFillCorrect) session.fillQueue.push(completed);
  session.lastFillCorrect = null;
  saveStore();

  if (!session.fillQueue.length) finishSession();
  else renderQuestion();
}

function finishSession() {
  const session = activeSession;
  session.stage = "done";
  session.completedAt = new Date().toISOString();
  if (!session.historyAdded) addHistoryEntry(session);
  saveStore();
  showSessionResult();
}

function addHistoryEntry(session) {
  const wordObjects = sessionWordObjects(session);
  const groups = [];
  for (let index = 0; index < wordObjects.length; index += 10) {
    groups.push(wordObjects.slice(index, index + 10).map((word) => word.french));
  }

  store.history.unshift({
    id: session.id,
    date: dateKey(),
    type: session.type,
    completedAt: session.completedAt || new Date().toISOString(),
    groups
  });
  session.historyAdded = true;
}

function showSessionResult() {
  const session = activeSession;
  resultTitle.textContent = session.type === "learn" ? "本组学习完成" : "复习完成";
  resultScore.textContent = String(session.words.length);
  resultTotal.textContent = String(session.words.length);
  resultMessage.textContent = "所有单词都完成了三轮练习和挖字母填空。";
  resultSummary.textContent = `${session.words.length} 个单词已记录到历史学习记录。`;
  const hasNewWords = store.seenWords.length < WORDS.length;
  restartButton.textContent = session.type === "learn" ? (hasNewWords ? "再学 10 个" : "新词已学完") : "再复习一遍";
  restartButton.disabled = session.type === "learn" && !hasNewWords;
  showScreen(screenResult, "result");
}

function renderHistory() {
  historyList.replaceChildren();
  if (!store.history.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "还没有完成的学习记录。";
    historyList.append(empty);
    showScreen(screenHistory, "history");
    return;
  }

  for (const entry of store.history) {
    const section = document.createElement("section");
    section.className = "history-entry";
    const header = document.createElement("div");
    header.className = "history-entry__header";
    const date = document.createElement("strong");
    date.textContent = entry.date;
    const type = document.createElement("span");
    type.className = "history-type";
    type.textContent = entry.type === "learn" ? "学习新词" : "复习单词";
    header.append(date, type);

    const list = document.createElement("div");
    list.className = "history-groups";
    entry.groups.forEach((group, groupIndex) => {
      const groupBlock = document.createElement("div");
      groupBlock.className = "history-group";
      const title = document.createElement("p");
      title.textContent = `第 ${groupIndex + 1} 组 · ${group.length} 个单词`;
      const words = document.createElement("div");
      words.className = "history-words";
      for (const wordId of group) {
        const word = wordByFrench.get(wordId);
        if (!word) continue;
        const row = document.createElement("p");
        row.textContent = `${word.french} — ${word.chinese}`;
        words.append(row);
      }
      groupBlock.append(title, words);
      list.append(groupBlock);
    });

    section.append(header, list);
    historyList.append(section);
  }

  showScreen(screenHistory, "history");
}

function renderHome() {
  const sentence = sentenceForDate();
  dailySentenceFr.textContent = sentence.fr;
  dailySentenceZh.textContent = sentence.zh;
  const today = dateKey();
  const hasIncomplete = (store.days[today]?.batches || []).some((batch) => batch.stage !== "done");
  const hasNewWords = store.seenWords.length < WORDS.length;

  if (hasIncomplete) {
    learnButton.disabled = false;
    learnButton.innerHTML = '继续学习 <span aria-hidden="true">→</span>';
    homeStatus.textContent = "今天的单词学习还没有完成。";
  } else if (hasNewWords) {
    learnButton.disabled = false;
    learnButton.innerHTML = '学习新单词 <span aria-hidden="true">＋</span>';
    homeStatus.textContent = `已学习 ${store.seenWords.length} / ${WORDS.length} 个 B2 单词`;
  } else {
    learnButton.disabled = true;
    learnButton.textContent = "新词已学完";
    homeStatus.textContent = "3,000 个 B2 单词都已经学习过了。";
  }
  showScreen(screenStart, "start");
}

function returnHome() {
  stopSpeech();
  activeSession = null;
  currentWord = null;
  currentTask = null;
  currentOptions = [];
  answered = false;
  renderHome();
}

function insertAccent(character) {
  const start = fillInput.selectionStart ?? fillInput.value.length;
  const end = fillInput.selectionEnd ?? fillInput.value.length;
  fillInput.setRangeText(character, start, end, "end");
  fillInput.focus();
}

ACCENTS.forEach((accent) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "accent-button";
  button.textContent = accent;
  button.addEventListener("click", () => insertAccent(accent));
  accentButtons.append(button);
});

learnButton.addEventListener("click", startLearnSession);
reviewButton.addEventListener("click", () => startReviewSession(false));
historyButton.addEventListener("click", renderHistory);
historyHomeButton.addEventListener("click", returnHome);
restartButton.addEventListener("click", () => {
  if (activeSession?.type === "review") startReviewSession(true);
  else startLearnSession();
});
homeButton.addEventListener("click", returnHome);
emptyHomeButton.addEventListener("click", returnHome);
nextButton.addEventListener("click", () => {
  if (activeSession?.stage === "rounds") advanceRoundQueue();
  else advanceFillQueue();
});
fillForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitFillAnswer();
});
speakButton.addEventListener("click", () => {
  if (activeSession?.stage === "rounds" && currentTask?.stage === 3) speakText(EXAMPLES[currentWord.french]);
  else speakText(currentWord?.french);
});
document.querySelector(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  returnHome();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && document.body.dataset.screen === "start") renderHome();
});

if (isSpeechSupported()) {
  updateFrenchVoice();
  window.speechSynthesis.addEventListener("voiceschanged", updateFrenchVoice);
} else {
  speakButton.disabled = true;
}

renderHome();