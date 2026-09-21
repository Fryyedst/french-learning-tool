const DAILY_NEW_COUNT = 10;
const OPTION_COUNT = 4;
const STORAGE_KEY = "french-vocab-progress-v3";
const STORAGE_VERSION = 3;
const ACCENTS = ["é", "è", "ê", "à", "ç", "ô", "û", "î", "œ", "ù", "â", "ï", "ë", "ü"];

const screenStart = document.querySelector("#screen-start");
const screenQuiz = document.querySelector("#screen-quiz");
const screenResult = document.querySelector("#screen-result");
const screenEmpty = document.querySelector("#screen-empty");
const learnButton = document.querySelector("#learn-button");
const reviewButton = document.querySelector("#review-button");
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
const choicePrompt = document.querySelector("#choice-prompt");
const fillPrompt = document.querySelector("#fill-prompt");
const questionArea = document.querySelector(".question-area");
const frenchWord = document.querySelector("#french-word");
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
const brand = document.querySelector(".brand");

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
let currentOptions = [];
let currentBlankedWord = "";
let answered = false;
let frenchVoice = null;
let speechVersion = 0;

function createDefaultStore() {
  return {
    version: STORAGE_VERSION,
    seenWords: [],
    days: {},
    reviews: {}
  };
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
  if (!isSpeechSupported()) {
    frenchVoice = null;
    return;
  }

  const frenchVoices = window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("fr"));

  frenchVoice =
    frenchVoices.find((voice) => voice.lang.toLowerCase() === "fr-fr") ||
    frenchVoices[0] ||
    null;
}

function speakCurrentWord() {
  if (!currentWord || !isSpeechSupported()) return;

  window.speechSynthesis.cancel();
  const version = ++speechVersion;
  const utterance = new SpeechSynthesisUtterance(currentWord.french);
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
  [screenStart, screenQuiz, screenResult, screenEmpty].forEach((item) => {
    item.hidden = true;
    item.classList.remove("screen--active");
  });
  document.body.dataset.screen = name;
  screen.hidden = false;
  screen.classList.add("screen--active");
}

function sessionWords(session) {
  return session.words.map((wordId) => wordByFrench.get(wordId)).filter(Boolean);
}

function openSession(type, sessionData) {
  activeSession = { type, data: sessionData };
  answered = false;
  currentOptions = [];

  if (sessionData.stage === "done") {
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
    openSession("learn", incomplete);
    return;
  }

  const seen = new Set(store.seenWords);
  const available = WORDS.filter((word) => !seen.has(word.french));
  if (available.length === 0) {
    showEmpty("新词已全部学完", "3,000 个 B2 单词都已经学习过了。");
    return;
  }

  const words = shuffle(available).slice(0, DAILY_NEW_COUNT).map((word) => word.french);
  const batch = {
    id: `${today}-${Date.now()}`,
    words,
    stage: "choice",
    choiceQueue: shuffle(words),
    fillQueue: [],
    choiceAttempted: [],
    firstTryCorrect: 0
  };

  store.days[today].batches.push(batch);
  store.seenWords.push(...words);
  saveStore();
  openSession("learn", batch);
}

function startReviewSession(reset = false) {
  stopSpeech();
  const today = dateKey();
  const sourceDate = yesterdayKey();
  const existing = store.reviews[today];

  if (existing && !reset) {
    openSession("review", existing);
    return;
  }

  const words = [
    ...new Set(
      (store.days[sourceDate]?.batches || []).flatMap((batch) => batch.words)
    )
  ];

  if (words.length === 0) {
    showEmpty("昨天没有学习单词", "先完成今天的新单词学习，明天就可以在这里复习了。");
    return;
  }

  const review = {
    id: `review-${today}`,
    sourceDate,
    words,
    stage: "choice",
    choiceQueue: shuffle(words),
    fillQueue: [],
    choiceAttempted: [],
    firstTryCorrect: 0
  };

  store.reviews[today] = review;
  saveStore();
  openSession("review", review);
}

function showEmpty(title, message) {
  stopSpeech();
  emptyTitle.textContent = title;
  emptyMessage.textContent = message;
  showScreen(screenEmpty, "empty");
}

function renderQuestion() {
  const session = activeSession?.data;
  if (!session) return;

  if (session.stage === "choice") {
    renderChoiceQuestion();
  } else if (session.stage === "fill") {
    renderFillQuestion();
  } else {
    showSessionResult();
  }
}

function setStageBadge() {
  const mode = activeSession.type === "learn" ? "学习新词" : "复习单词";
  stageBadge.textContent = activeSession.data.stage === "fill" ? `${mode} · 拼写` : mode;
  stageBadge.hidden = false;
}

function renderChoiceQuestion() {
  const session = activeSession.data;
  currentWord = wordByFrench.get(session.choiceQueue[0]);
  if (!currentWord) {
    startFillStage();
    return;
  }

  answered = false;
  correctMark.hidden = true;
  feedback.textContent = "";
  feedback.className = "feedback";
  speechStatus.textContent = "";
  nextButton.hidden = true;
  fillForm.hidden = true;
  optionsContainer.hidden = false;
  choicePrompt.hidden = false;
  fillPrompt.hidden = true;
  frenchWord.textContent = currentWord.french;

  const total = session.words.length;
  const mastered = total - new Set(session.choiceQueue).size;
  const retrying = session.choiceAttempted.includes(currentWord.french);
  questionCount.textContent = retrying ? "四选一 · 错题重练" : `四选一 · 第 ${mastered + 1} / ${total} 题`;
  scoreText.textContent = `首次答对 ${session.firstTryCorrect} / ${total}`;
  progressBar.style.width = `${(mastered / total) * 100}%`;
  setStageBadge();

  currentOptions = shuffle([currentWord, ...chooseDistractors(currentWord)]);
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
    const chinese = document.createElement("span");
    chinese.className = "option-chinese";
    chinese.textContent = option.chinese;
    const translation = document.createElement("span");
    translation.className = "option-translation";
    translation.textContent = option.french;
    translation.setAttribute("aria-hidden", "true");
    optionCopy.append(chinese, translation);
    button.append(optionIndex, optionCopy);
    button.addEventListener("click", () => selectChoiceAnswer(button, index));
    optionsContainer.append(button);
  });

  requestAnimationFrame(() => questionArea.scrollIntoView({ behavior: "smooth", block: "center" }));
  speakCurrentWord();
}

function chooseDistractors(word) {
  const selected = [];
  const usedSenses = new Set([word.sense]);
  const usedChinese = new Set([word.chinese]);

  const addFromPool = (pool) => {
    for (const candidate of shuffle(pool || [])) {
      if (selected.length >= OPTION_COUNT - 1) return;
      if (
        candidate.french === word.french ||
        usedSenses.has(candidate.sense) ||
        usedChinese.has(candidate.chinese)
      ) continue;
      selected.push(candidate);
      usedSenses.add(candidate.sense);
      usedChinese.add(candidate.chinese);
    }
  };

  addFromPool(poolsByLevelAndPos.get(`${word.level}|${word.pos}`));
  addFromPool(WORDS);
  return selected.slice(0, OPTION_COUNT - 1);
}

function selectChoiceAnswer(selectedButton, selectedIndex) {
  if (answered) return;
  answered = true;

  const session = activeSession.data;
  const selectedWord = currentOptions[selectedIndex];
  const isCorrect = selectedWord.sense === currentWord.sense && selectedWord.chinese === currentWord.chinese;
  const firstAttempt = !session.choiceAttempted.includes(currentWord.french);

  if (firstAttempt) session.choiceAttempted.push(currentWord.french);
  if (firstAttempt && isCorrect) session.firstTryCorrect += 1;
  session.lastChoiceCorrect = isCorrect;
  saveStore();

  scoreText.textContent = `首次答对 ${session.firstTryCorrect} / ${session.words.length}`;
  correctMark.hidden = !isCorrect;

  optionsContainer.querySelectorAll(".option-button").forEach((button) => {
    const option = currentOptions[Number(button.dataset.optionIndex)];
    button.disabled = true;
    button.querySelector(".option-translation").classList.add("option-translation--visible");
    button.querySelector(".option-translation").setAttribute("aria-hidden", "false");
    if (option.sense === currentWord.sense && option.chinese === currentWord.chinese) {
      button.classList.add("option-button--correct");
    } else if (button === selectedButton) {
      button.classList.add("option-button--wrong");
    }
  });

  feedback.textContent = isCorrect
    ? `回答正确！${currentWord.french} 的意思是“${currentWord.chinese}”。`
    : `回答错误。正确答案是“${currentWord.chinese}”，这道题会稍后再次出现。`;
  feedback.classList.add(isCorrect ? "feedback--correct" : "feedback--wrong");

  const lastUniqueWord = new Set(session.choiceQueue).size === 1;
  nextButton.innerHTML = isCorrect && lastUniqueWord
    ? '进入拼写练习 <span aria-hidden="true">→</span>'
    : '下一题 <span aria-hidden="true">→</span>';
  nextButton.hidden = false;
  nextButton.focus();
}

function advanceChoiceQueue() {
  const session = activeSession.data;
  const completed = session.choiceQueue.shift();
  if (!session.lastChoiceCorrect) session.choiceQueue.push(completed);
  session.lastChoiceCorrect = null;
  saveStore();

  if (session.choiceQueue.length === 0) {
    startFillStage();
    return;
  }

  renderQuestion();
}

function startFillStage() {
  const session = activeSession.data;
  session.stage = "fill";
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

  return {
    display: characters.map((character, index) => blankIndexes.has(index) ? "_" : character).join(""),
    indexes: blankIndexes
  };
}

function renderFillQuestion() {
  const session = activeSession.data;
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
  fillPrompt.hidden = false;
  optionsContainer.hidden = true;
  fillForm.hidden = false;
  fillInput.disabled = false;
  fillSubmit.disabled = false;
  fillInput.value = "";

  currentBlankedWord = createBlankedWord(currentWord.french);
  blankedWord.textContent = currentBlankedWord.display;
  fillChinese.textContent = currentWord.chinese;

  const total = session.words.length;
  const remaining = session.fillQueue.length;
  questionCount.textContent = `挖字母填空 · 剩余 ${remaining} 个`;
  scoreText.textContent = `首次答对 ${session.firstTryCorrect} / ${total} · 拼写不计分`;
  progressBar.style.width = `${((total - remaining) / total) * 100}%`;
  setStageBadge();

  requestAnimationFrame(() => {
    questionArea.scrollIntoView({ behavior: "smooth", block: "center" });
    fillInput.focus({ preventScroll: true });
  });
  speakCurrentWord();
}

function normalizeTypedWord(value) {
  return value.normalize("NFC").replace(/[’]/g, "'").trim().toLowerCase();
}

function submitFillAnswer() {
  if (answered) return;
  answered = true;

  const session = activeSession.data;
  const typed = normalizeTypedWord(fillInput.value);
  const expected = normalizeTypedWord(currentWord.french);
  const isCorrect = typed === expected;

  fillInput.disabled = true;
  fillSubmit.disabled = true;
  blankedWord.textContent = currentWord.french;
  correctMark.hidden = !isCorrect;
  session.lastFillCorrect = isCorrect;
  saveStore();

  feedback.textContent = isCorrect
    ? `拼写正确！${currentWord.french} 的意思是“${currentWord.chinese}”。`
    : `拼写错误。正确写法是“${currentWord.french}”，这道题会稍后再次出现。`;
  feedback.classList.add(isCorrect ? "feedback--correct" : "feedback--wrong");

  const lastWord = session.fillQueue.length === 1;
  nextButton.innerHTML = isCorrect && lastWord
    ? '完成本组 <span aria-hidden="true">→</span>'
    : '下一题 <span aria-hidden="true">→</span>';
  nextButton.hidden = false;
  nextButton.focus();
}

function advanceFillQueue() {
  const session = activeSession.data;
  const completed = session.fillQueue.shift();
  if (!session.lastFillCorrect) session.fillQueue.push(completed);
  session.lastFillCorrect = null;
  saveStore();

  if (session.fillQueue.length === 0) {
    finishSession();
    return;
  }

  renderQuestion();
}

function finishSession() {
  const session = activeSession.data;
  session.stage = "done";
  session.completedAt = new Date().toISOString();
  saveStore();
  showSessionResult();
}

function showSessionResult() {
  const session = activeSession.data;
  const total = session.words.length;
  const isLearn = activeSession.type === "learn";

  resultTitle.textContent = isLearn ? "本组学习完成" : "复习完成";
  resultScore.textContent = String(session.firstTryCorrect);
  resultTotal.textContent = String(total);
  resultMessage.textContent = session.firstTryCorrect === total
    ? "四选一全部一次答对，拼写练习也完成了。"
    : `四选一首次答对 ${session.firstTryCorrect} 题，错题和拼写经过重练后已完成。`;
  resultSummary.textContent = isLearn
    ? `${total} 个新单词已完成四选一和挖字母填空。`
    : `已复习昨天学习的 ${total} 个单词。`;

  const hasNewWords = store.seenWords.length < WORDS.length;
  restartButton.textContent = isLearn ? (hasNewWords ? "再学 10 个" : "新词已学完") : "再复习一遍";
  restartButton.disabled = isLearn && !hasNewWords;
  showScreen(screenResult, "result");
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
restartButton.addEventListener("click", () => {
  if (activeSession?.type === "review") startReviewSession(true);
  else startLearnSession();
});
homeButton.addEventListener("click", returnHome);
emptyHomeButton.addEventListener("click", returnHome);
nextButton.addEventListener("click", () => {
  if (activeSession?.data.stage === "choice") advanceChoiceQueue();
  else advanceFillQueue();
});
fillForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitFillAnswer();
});
speakButton.addEventListener("click", speakCurrentWord);
brand.addEventListener("click", (event) => {
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