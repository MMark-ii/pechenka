// Initialize VK Bridge
vkBridge.send('VKWebAppInit');

console.log('Game script loaded');

// DOM Elements
const askButton = document.getElementById('ask-button');
const categorySelectionDiv = document.getElementById('category-selection');
const predictionTextElement = document.getElementById('prediction-text');

let predictionsData = {};
const STORAGE_KEY = 'pechenka_user_stats_v2';
const MAX_SHOWN_PREDICTIONS = 30;

// Function to get current date as YYYY-MM-DD
function getCurrentDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Function to get current month as YYYY-MM
function getCurrentMonthString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

// Function to fetch predictions
async function loadPredictions() {
    askButton.disabled = true;
    askButton.textContent = 'Загрузка предсказаний...';
    try {
        const response = await fetch('pechenka.json');
        if (!response.ok) {
            console.error('Fetch response not OK:', response);
            throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
        }
        predictionsData = await response.json();
        console.log('Predictions loaded:', predictionsData);
        askButton.disabled = false;
        askButton.textContent = 'спросить';
    } catch (error) {
        console.error('Failed to load predictions (подробная ошибка):', error);
        predictionTextElement.textContent = 'Не удалось загрузить предсказания. Попробуйте позже. Проверьте консоль для деталей.';
    }
}

async function getUserStats() {
    try {
        const storedData = await vkBridge.send('VKWebAppStorageGet', { keys: [STORAGE_KEY] });
        if (storedData.keys && storedData.keys[0].value && storedData.keys[0].value.length > 0) {
            try {
                return JSON.parse(storedData.keys[0].value);
            } catch (e) {
                console.error("Error parsing userStats from VK Storage", e);
            }
        }
    } catch (error) {
        console.error("Error fetching userStats from VK Storage", error);
    }
    // Return default structure if not found or error
    return {
        lastPlayAM: '',
        lastPlayPM: '',
        shownPredictions: [],
        predictionsMonth: getCurrentMonthString()
    };
}

async function setUserStats(stats) {
    try {
        await vkBridge.send('VKWebAppStorageSet', { key: STORAGE_KEY, value: JSON.stringify(stats) });
        console.log('User stats updated in VK Storage:', stats);
    } catch (error) {
        console.error("Error updating user stats in VK Storage:", error);
    }
}

// Function to check play eligibility and display categories
async function checkEligibilityAndDisplayCategories() {
    predictionTextElement.textContent = '';
    categorySelectionDiv.innerHTML = '';
    askButton.disabled = true;

    let userStats = await getUserStats();

    // Monthly reset of shown predictions
    const currentMonthStr = getCurrentMonthString();
    if (userStats.predictionsMonth !== currentMonthStr) {
        userStats.shownPredictions = [];
        userStats.predictionsMonth = currentMonthStr;
        // No need to save here, will be saved after prediction or if eligibility fails and we want to save the month reset
    }

    const currentDateStr = getCurrentDateString();
    const currentHour = new Date().getHours();
    let canPlay = false;
    let currentSlot = '';

    if (currentHour < 12) {
        currentSlot = 'AM';
        if (userStats.lastPlayAM !== currentDateStr) canPlay = true;
    } else {
        currentSlot = 'PM';
        if (userStats.lastPlayPM !== currentDateStr) canPlay = true;
    }

    if (canPlay) {
        displayCategoryButtons();
    } else {
        const message = currentSlot === 'AM' ? 
            'Вы уже получили предсказание сегодня утром. Попробуйте после 12:00.' : 
            'Вы уже получили предсказание сегодня. Попробуйте завтра!';
        predictionTextElement.textContent = message;
        await setUserStats(userStats); // Save stats in case month was reset
    }
    askButton.disabled = false;
}

function displayCategoryButtons() {
    categorySelectionDiv.innerHTML = '';
    const categories = Object.keys(predictionsData).filter(cat => cat !== "Нейтральные и универсальные");
    categories.forEach(category => {
        const button = document.createElement('button');
        button.textContent = category;
        button.addEventListener('click', () => getPrediction(category));
        categorySelectionDiv.appendChild(button);
    });
    const randomButton = document.createElement('button');
    randomButton.textContent = 'На удачу';
    randomButton.classList.add('random-luck-button');
    randomButton.addEventListener('click', () => getPrediction(null));
    categorySelectionDiv.appendChild(randomButton);
    predictionTextElement.textContent = 'Выберите категорию или испытайте удачу:';
}

async function getPrediction(category) {
    let chosenCategoryName = category;
    let predictionText = '';
    askButton.disabled = true; // Disable button during processing

    if (Object.keys(predictionsData).length === 0) {
        predictionTextElement.textContent = 'Данные предсказаний еще не загружены. Подождите.';
        askButton.disabled = false;
        return;
    }

    let userStats = await getUserStats();
    // Monthly reset check again, in case user left tab open for long
    const currentMonthStr = getCurrentMonthString();
    if (userStats.predictionsMonth !== currentMonthStr) {
        userStats.shownPredictions = [];
        userStats.predictionsMonth = currentMonthStr;
    }

    if (!chosenCategoryName) { // "На удачу"
        const availableCategories = Object.keys(predictionsData).filter(cat => cat !== "Нейтральные и универсальные");
        if (availableCategories.length > 0) {
            chosenCategoryName = availableCategories[Math.floor(Math.random() * availableCategories.length)];
        } else {
            predictionTextElement.textContent = 'Нет доступных категорий для предсказания.';
            categorySelectionDiv.innerHTML = '';
            askButton.disabled = false;
            await setUserStats(userStats); // Save potential month reset
            return;
        }
    }

    const categoryPredictions = predictionsData[chosenCategoryName];
    if (categoryPredictions && categoryPredictions.length > 0) {
        let availableNewPredictions = categoryPredictions.filter(p => !userStats.shownPredictions.includes(p));
        
        if (availableNewPredictions.length > 0) {
            predictionText = availableNewPredictions[Math.floor(Math.random() * availableNewPredictions.length)];
        } else {
            // All predictions in this category were shown recently, pick any random from this category
            predictionText = categoryPredictions[Math.floor(Math.random() * categoryPredictions.length)];
            // Optionally, add a note that it might be a repeat or that all unique for the period were shown.
        }

        // Update shownPredictions list
        userStats.shownPredictions.push(predictionText);
        if (userStats.shownPredictions.length > MAX_SHOWN_PREDICTIONS) {
            userStats.shownPredictions.shift(); // Remove the oldest
        }

    } else {
        predictionText = 'Не удалось получить предсказание для этой категории.';
    }

    predictionTextElement.textContent = predictionText;
    categorySelectionDiv.innerHTML = '';

    // Update last play time
    const currentDateStr = getCurrentDateString();
    const currentHour = new Date().getHours();
    if (currentHour < 12) {
        userStats.lastPlayAM = currentDateStr;
    } else {
        userStats.lastPlayPM = currentDateStr;
    }
    
    await setUserStats(userStats);
    askButton.disabled = false; // Re-enable button
}

// Event Listeners
askButton.addEventListener('click', checkEligibilityAndDisplayCategories);
loadPredictions();

vkBridge.send('VKWebAppGetUserInfo')
  .then(data => {
    console.log('User info:', data); 
  })
  .catch(error => {
    console.error('Failed to get user info:', error);
  }); 