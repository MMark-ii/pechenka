// Initialize VK Bridge
vkBridge.send('VKWebAppInit');

console.log('Game script loaded');

// DOM Elements
const askButton = document.getElementById('ask-button');
const categorySelectionDiv = document.getElementById('category-selection');
const predictionTextElement = document.getElementById('prediction-text');

let predictionsData = {};
const STORAGE_KEY = 'pechenka_user_stats';

// Function to get current date as YYYY-MM-DD
function getCurrentDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
        // Кнопка останется неактивной
    }
}

// Function to check play eligibility and display categories
async function checkEligibilityAndDisplayCategories() {
    predictionTextElement.textContent = ''; // Clear previous message/prediction
    categorySelectionDiv.innerHTML = ''; // Clear previous categories
    askButton.disabled = true; // Disable while checking

    try {
        const storedData = await vkBridge.send('VKWebAppStorageGet', { keys: [STORAGE_KEY] });
        let userStats = {};
        if (storedData.keys && storedData.keys[0].value) {
            try {
                userStats = JSON.parse(storedData.keys[0].value);
            } catch (e) {
                console.error("Error parsing userStats from VK Storage", e);
                userStats = {}; // Reset if parsing fails
            }
        }

        const currentDateStr = getCurrentDateString();
        const currentHour = new Date().getHours();
        let canPlay = false;
        let currentSlot = '';

        if (currentHour < 12) { // AM Slot (00:00 - 11:59)
            currentSlot = 'AM';
            if (userStats.lastPlayAM !== currentDateStr) {
                canPlay = true;
            }
        } else { // PM Slot (12:00 - 23:59)
            currentSlot = 'PM';
            if (userStats.lastPlayPM !== currentDateStr) {
                canPlay = true;
            }
        }

        if (canPlay) {
            displayCategoryButtons();
        } else {
            const message = currentSlot === 'AM' ? 
                'Вы уже получили предсказание сегодня утром. Попробуйте после 12:00.' : 
                'Вы уже получили предсказание сегодня. Попробуйте завтра!';
            predictionTextElement.textContent = message;
        }

    } catch (error) {
        console.error("Error checking eligibility from VK Storage:", error);
        predictionTextElement.textContent = 'Не удалось проверить историю игры. Попробуйте еще раз.';
        // Можно показать категории, если не удалось проверить, или заблокировать - пока показываем
        displayCategoryButtons(); // Or handle error more gracefully
    } finally {
        askButton.disabled = false; // Re-enable button
    }
}

function displayCategoryButtons() {
    categorySelectionDiv.innerHTML = ''; // Clear previous categories
    // predictionTextElement.textContent = ''; // Cleared in checkEligibilityAndDisplayCategories

    const categories = Object.keys(predictionsData).filter(cat => cat !== "Нейтральные и универсальные");
    
    categories.forEach(category => {
        const button = document.createElement('button');
        button.textContent = category;
        button.addEventListener('click', () => getPrediction(category));
        categorySelectionDiv.appendChild(button);
    });

    const randomButton = document.createElement('button');
    randomButton.textContent = 'На удачу';
    randomButton.addEventListener('click', () => getPrediction(null));
    categorySelectionDiv.appendChild(randomButton);
    predictionTextElement.textContent = 'Выберите категорию или испытайте удачу:';
}

// Function to get and display a prediction, then update storage
async function getPrediction(category) {
    let chosenCategory = category;
    let prediction = '';

    if (Object.keys(predictionsData).length === 0) {
        predictionTextElement.textContent = 'Данные предсказаний еще не загружены. Подождите.';
        return;
    }

    if (!chosenCategory) { // "На удачу"
        const availableCategories = Object.keys(predictionsData).filter(cat => cat !== "Нейтральные и универсальные");
        if (availableCategories.length > 0) {
            chosenCategory = availableCategories[Math.floor(Math.random() * availableCategories.length)];
        } else {
            predictionTextElement.textContent = 'Нет доступных категорий для предсказания.';
            categorySelectionDiv.innerHTML = '';
            return;
        }
    }

    if (predictionsData[chosenCategory] && predictionsData[chosenCategory].length > 0) {
        const categoryPredictions = predictionsData[chosenCategory];
        prediction = categoryPredictions[Math.floor(Math.random() * categoryPredictions.length)];
    } else {
        prediction = 'Не удалось получить предсказание для этой категории.';
    }

    predictionTextElement.textContent = prediction;
    categorySelectionDiv.innerHTML = ''; // Clear category buttons after selection

    // Update storage
    try {
        const storedData = await vkBridge.send('VKWebAppStorageGet', { keys: [STORAGE_KEY] });
        let userStats = {};
        if (storedData.keys && storedData.keys[0].value) {
            try {
                userStats = JSON.parse(storedData.keys[0].value);
            } catch (e) { userStats = {}; }
        }

        const currentDateStr = getCurrentDateString();
        const currentHour = new Date().getHours();

        if (currentHour < 12) {
            userStats.lastPlayAM = currentDateStr;
        } else {
            userStats.lastPlayPM = currentDateStr;
        }
        await vkBridge.send('VKWebAppStorageSet', { key: STORAGE_KEY, value: JSON.stringify(userStats) });
        console.log('User stats updated in VK Storage:', userStats);
    } catch (error) {
        console.error("Error updating user stats in VK Storage:", error);
        // Можно уведомить пользователя, что его попытка может не сохраниться
    }
}

// Event Listeners
askButton.addEventListener('click', checkEligibilityAndDisplayCategories);

// Load predictions when the script runs
loadPredictions();

// Example: Get user info (can be kept or removed / used)
vkBridge.send('VKWebAppGetUserInfo')
  .then(data => {
    console.log('User info:', data); // Useful for debugging user-specific issues
  })
  .catch(error => {
    console.error('Failed to get user info:', error);
  }); 