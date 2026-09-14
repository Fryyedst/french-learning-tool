const OFFICIAL_QUESTION_COUNT = 20;
const OPTION_COUNT = 4;
const ROUND_LEVEL_COUNTS = { A2: 3, B1: 5, B2: 12 };

const screenStart = document.querySelector("#screen-start");
const screenQuiz = document.querySelector("#screen-quiz");
const screenResult = document.querySelector("#screen-result");
const startButton = document.querySelector("#start-button");
const restartButton = document.querySelector("#restart-button");
const homeButton = document.querySelector("#home-button");
const nextButton = document.querySelector("#next-button");
const optionsContainer = document.querySelector("#options");
const questionCount = document.querySelector(".question-count");
const progressBar = document.querySelector("#progress-bar");
const scoreText = document.querySelector("#score-text");
const retryBadge = document.querySelector("#retry-badge");
const correctMark = document.querySelector("#correct-mark");
const questionLabel = document.querySelector("#question-label");
const questionArea = document.querySelector(".question-area");
const frenchWord = document.querySelector("#french-word");
const feedback = document.querySelector("#feedback");
const speakButton = document.querySelector("#speak-button");
const speechStatus = document.querySelector("#speech-status");
const resultScore = document.querySelector("#result-score");
const resultMessage = document.querySelector("#result-message");
const resultSummary = document.querySelector("#result-summary");
const brand = document.querySelector(".brand");

let officialQuestions = [];
let officialIndex = 0;
let officialCorrect = 0;
let officialWrongWords = [];
let retryQueue = [];
let initialRetryCount = 0;
let currentWord = null;
let currentOptions = [];
let answered = false;
let phase = "idle";
let repeatCurrentInRetry = false;
let retryAttempts = new Map();
let frenchVoice = null;
let speechVersion = 0;

const poolsByLevel = new Map();
const poolsByLevelAndPos = new Map();

for (const word of WORDS) {
  if (!poolsByLevel.has(word.level)) poolsByLevel.set(word.level, []);
  poolsByLevel.get(word.level).push(word);

  const key = `${word.level}|${word.pos}`;
  if (!poolsByLevelAndPos.has(key)) poolsByLevelAndPos.set(key, []);
  poolsByLevelAndPos.get(key).push(word);
}

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }

  return copy;
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
  if (!currentWord) return;

  if (!isSpeechSupported()) {
    speakButton.disabled = true;
    speechStatus.textContent = "当前浏览器暂不支持语音播放";
    return;
  }

  window.speechSynthesis.cancel();
  const version = ++speechVersion;
  const utterance = new SpeechSynthesisUtterance(currentWord.french);
  utterance.lang = "fr-FR";
  utterance.rate = 0.82;
  utterance.pitch = 1;

  if (frenchVoice) utterance.voice = frenchVoice;

  utterance.onend = () => {
    if (version === speechVersion) speechStatus.textContent = "";
  };

  utterance.onerror = () => {
    if (version === speechVersion) {
      speechStatus.textContent = "暂时无法播放，请检查系统语音设置";
    }
  };

  speechStatus.textContent = "正在播放法语发音";
  window.speechSynthesis.speak(utterance);
}

function stopSpeech() {
  if (!isSpeechSupported()) return;
  speechVersion += 1;
  window.speechSynthesis.cancel();
}

function showScreen(screen, phaseName) {
  [screenStart, screenQuiz, screenResult].forEach((item) => {
    item.hidden = true;
    item.classList.remove("screen--active");
  });

  document.body.dataset.screen = phaseName;
  screen.hidden = false;
  screen.classList.add("screen--active");
}

function buildOfficialQuestions() {
  const selected = [];

  for (const [level, count] of Object.entries(ROUND_LEVEL_COUNTS)) {
    selected.push(...shuffle(poolsByLevel.get(level) || []).slice(0, count));
  }

  return shuffle(selected);
}

function startQuiz() {
  stopSpeech();
  officialQuestions = buildOfficialQuestions();
  officialIndex = 0;
  officialCorrect = 0;
  officialWrongWords = [];
  retryQueue = [];
  initialRetryCount = 0;
  repeatCurrentInRetry = false;
  retryAttempts = new Map();
  phase = "official";

  showScreen(screenQuiz, "quiz");
  renderQuestion();
}

function chooseDistractors(word) {
  const selected = [];
  const usedSenses = new Set([word.sense]);
  const usedChinese = new Set([word.chinese]);
  const adjacentLevels = {
    A2: ["B1"],
    B1: ["A2", "B2"],
    B2: ["B1"]
  }[word.level] || [];

  const addFromPool = (pool) => {
    for (const candidate of shuffle(pool || [])) {
      if (selected.length >= OPTION_COUNT - 1) return;

      if (
        candidate.french === word.french ||
        usedSenses.has(candidate.sense) ||
        usedChinese.has(candidate.chinese)
      ) {
        continue;
      }

      selected.push(candidate);
      usedSenses.add(candidate.sense);
      usedChinese.add(candidate.chinese);
    }
  };

  addFromPool(poolsByLevelAndPos.get(`${word.level}|${word.pos}`));

  for (const level of adjacentLevels) {
    addFromPool(poolsByLevelAndPos.get(`${level}|${word.pos}`));
  }

  addFromPool(poolsByLevel.get(word.level));

  for (const level of adjacentLevels) {
    addFromPool(poolsByLevel.get(level));
  }

  addFromPool(WORDS);
  return selected.slice(0, OPTION_COUNT - 1);
}

function renderQuestion() {
  if (phase === "official") {
    currentWord = officialQuestions[officialIndex];
    questionCount.textContent = `第 ${officialIndex + 1} / ${OFFICIAL_QUESTION_COUNT} 题`;
    scoreText.textContent = `已答对 ${officialCorrect} / ${OFFICIAL_QUESTION_COUNT}`;
    retryBadge.hidden = true;
    questionLabel.textContent = "它的中文意思是？";
    progressBar.style.width = `${((officialIndex + 1) / OFFICIAL_QUESTION_COUNT) * 100}%`;
  } else {
    currentWord = retryQueue[0];
    questionCount.textContent = `错题重练 · 剩余 ${retryQueue.length} 题`;
    scoreText.textContent = `正式题得分 ${officialCorrect} / ${OFFICIAL_QUESTION_COUNT} · 错题不计分`;
    retryBadge.hidden = false;
    questionLabel.textContent = (retryAttempts.get(currentWord.french) || 0) > 0
      ? "这道题又出现了，再选一次"
      : "这道题之前答错了，再选一次";
    progressBar.style.width = `${Math.max(0, ((initialRetryCount - retryQueue.length) / initialRetryCount) * 100)}%`;
  }

  answered = false;
  repeatCurrentInRetry = false;
  correctMark.hidden = true;
  frenchWord.textContent = currentWord.french;
  feedback.textContent = "";
  feedback.className = "feedback";
  speechStatus.textContent = "";
  nextButton.hidden = true;
  optionsContainer.replaceChildren();

  currentOptions = shuffle([currentWord, ...chooseDistractors(currentWord)]);

  currentOptions.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-button";
    button.dataset.optionIndex = String(index);

    const optionIndex = document.createElement("span");
    optionIndex.className = "option-index";
    optionIndex.setAttribute("aria-hidden", "true");
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
    button.addEventListener("click", () => selectAnswer(button, index));
    optionsContainer.append(button);
  });

  requestAnimationFrame(() => {
    questionArea.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  speakCurrentWord();
}

function selectAnswer(selectedButton, selectedIndex) {
  if (answered) return;
  answered = true;

  const selectedWord = currentOptions[selectedIndex];
  const isCorrect = selectedWord.sense === currentWord.sense && selectedWord.chinese === currentWord.chinese;

  if (phase === "official") {
    if (isCorrect) {
      officialCorrect += 1;
    } else {
      officialWrongWords.push(currentWord);
    }
    scoreText.textContent = `已答对 ${officialCorrect} / ${OFFICIAL_QUESTION_COUNT}`;
  } else {
    repeatCurrentInRetry = !isCorrect;
    retryAttempts.set(currentWord.french, (retryAttempts.get(currentWord.french) || 0) + 1);
    scoreText.textContent = `正式题得分 ${officialCorrect} / ${OFFICIAL_QUESTION_COUNT} · 错题不计分`;
  }

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

  if (phase === "official") {
    feedback.textContent = isCorrect
      ? `回答正确！${currentWord.french} 的意思是“${currentWord.chinese}”。`
      : `回答错误，这道题会进入错题重练。正确答案是“${currentWord.chinese}”。`;
  } else {
    feedback.textContent = isCorrect
      ? `正确！${currentWord.french} 已从错题队列中移除。`
      : `还不对，这道题稍后会再次出现。正确答案是“${currentWord.chinese}”。`;
  }

  feedback.classList.add(isCorrect ? "feedback--correct" : "feedback--wrong");

  const isLastOfficial = phase === "official" && officialIndex === OFFICIAL_QUESTION_COUNT - 1;
  const isLastRetry = phase === "retry" && retryQueue.length === 1 && !repeatCurrentInRetry;

  if (isLastOfficial && officialWrongWords.length > 0) {
    nextButton.innerHTML = '开始错题重练 <span aria-hidden="true">→</span>';
  } else if (isLastOfficial || isLastRetry) {
    nextButton.innerHTML = '查看结果 <span aria-hidden="true">→</span>';
  } else {
    nextButton.innerHTML = '下一题 <span aria-hidden="true">→</span>';
  }

  nextButton.hidden = false;
  nextButton.focus();
}

function goToNextQuestion() {
  if (!answered) return;

  if (phase === "official") {
    if (officialIndex < OFFICIAL_QUESTION_COUNT - 1) {
      officialIndex += 1;
      renderQuestion();
      return;
    }

    if (officialWrongWords.length > 0) {
      phase = "retry";
      retryQueue = [...officialWrongWords];
      initialRetryCount = retryQueue.length;
      renderQuestion();
      return;
    }

    showResult();
    return;
  }

  const completedWord = retryQueue.shift();
  if (repeatCurrentInRetry) retryQueue.push(completedWord);

  if (retryQueue.length === 0) {
    showResult();
    return;
  }

  renderQuestion();
}

function showResult() {
  phase = "result";
  stopSpeech();
  resultScore.textContent = String(officialCorrect);

  if (officialCorrect === OFFICIAL_QUESTION_COUNT) {
    resultMessage.textContent = "太厉害了！20 道正式题全部答对。";
    resultSummary.textContent = "首次答题全部正确，不需要错题重练。";
  } else if (officialCorrect >= 18) {
    resultMessage.textContent = "表现很棒！错题也都已经订正。";
    resultSummary.textContent = `首次答错 ${officialWrongWords.length} 道 · 错题重练已全部答对`;
  } else if (officialCorrect >= 14) {
    resultMessage.textContent = "完成得不错，错题已经全部掌握。";
    resultSummary.textContent = `首次答错 ${officialWrongWords.length} 道 · 错题重练已全部答对`;
  } else {
    resultMessage.textContent = "这一轮已经完成，错题也全部订正了。";
    resultSummary.textContent = `首次答错 ${officialWrongWords.length} 道 · 错题重练已全部答对`;
  }

  showScreen(screenResult, "result");
}

function returnHome() {
  stopSpeech();
  officialQuestions = [];
  officialIndex = 0;
  officialCorrect = 0;
  officialWrongWords = [];
  retryQueue = [];
  retryAttempts = new Map();
  currentWord = null;
  currentOptions = [];
  answered = false;
  phase = "idle";
  showScreen(screenStart, "start");
}

startButton.addEventListener("click", startQuiz);
restartButton.addEventListener("click", startQuiz);
homeButton.addEventListener("click", returnHome);
nextButton.addEventListener("click", goToNextQuestion);
speakButton.addEventListener("click", speakCurrentWord);

brand.addEventListener("click", (event) => {
  event.preventDefault();
  returnHome();
});

if (isSpeechSupported()) {
  updateFrenchVoice();
  window.speechSynthesis.addEventListener("voiceschanged", updateFrenchVoice);
} else {
  speakButton.disabled = true;
}