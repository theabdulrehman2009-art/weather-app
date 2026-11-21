"use strict";

// STEP 1: Select HTML elements once, so we can update them later.
const searchForm = document.querySelector("#searchForm");
const cityInput = document.querySelector("#cityInput");
const searchButton = document.querySelector("#searchButton");
const searchButtonText = document.querySelector("#searchButtonText");
const searchSpinner = document.querySelector("#searchSpinner");
const statusMessage = document.querySelector("#statusMessage");
const emptyState = document.querySelector("#emptyState");
const weatherPanel = document.querySelector("#weatherPanel");
const forecastList = document.querySelector("#forecastList");

// If the student searches again before a request finishes, cancel the old one.
let activeController = null;

// STEP 2: Make a reusable helper for JSON requests.
async function fetchJSON(url, signal) {
  // fetch() returns a Promise. await pauses THIS async function (not the whole page).
  const response = await fetch(url, { signal });

  // fetch() does not reject automatically for HTTP 404 or 500 responses.
  if (!response.ok) {
    throw new Error(`Server returned HTTP ${response.status}. Please try again.`);
  }

  // Reading and parsing the JSON body is also asynchronous.
  return response.json();
}

// STEP 3: Search for a city's coordinates using the Geocoding API.
async function findCity(cityName, signal) {
  // URLSearchParams safely encodes city names, including spaces and special characters.
  const params = new URLSearchParams({
    name: cityName,
    count: "1",
    language: "en",
    format: "json"
  });
  const url = `https://geocoding-api.open-meteo.com/v1/search?${params}`;
  const data = await fetchJSON(url, signal);

  // Some searches return an object without a 'results' field.
  if (!Array.isArray(data.results) || data.results.length === 0) {
    throw new Error(`No city found for “${cityName}”. Please check the spelling.`);
  }

  // For this beginner project, take the first matching city.
  return data.results[0];
}

// STEP 4: Request current conditions AND the five-day forecast.
async function getWeather(latitude, longitude, signal) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "auto",          // Use the city's local time zone.
    forecast_days: "5",         // Today plus the next four days.
    temperature_unit: "celsius",
    wind_speed_unit: "kmh"
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const weatherData = await fetchJSON(url, signal);

  // Validate the fields that our UI needs before using them.
  if (!weatherData.current || !weatherData.daily || !Array.isArray(weatherData.daily.time)) {
    throw new Error("Weather data is unavailable right now. Please try later.");
  }

  return weatherData;
}

// STEP 5: Convert numeric WMO weather codes to human-friendly text and emoji.
// Reference: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
function getWeatherInfo(code, isDay = true) {
  if (code === 0) return { description: "Clear sky", icon: isDay ? "☀️" : "🌙" };
  if (code === 1) return { description: "Mainly clear", icon: isDay ? "🌤️" : "🌙" };
  if (code === 2) return { description: "Partly cloudy", icon: "⛅" };
  if (code === 3) return { description: "Overcast", icon: "☁️" };
  if ([45, 48].includes(code)) return { description: "Foggy", icon: "🌫️" };
  if ([51, 53, 55, 56, 57].includes(code)) return { description: "Drizzle", icon: "🌦️" };
  if ([61, 63, 65, 66, 67].includes(code)) return { description: "Rainy", icon: "🌧️" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { description: "Snowy", icon: "❄️" };
  if ([80, 81, 82].includes(code)) return { description: "Rain showers", icon: "🌦️" };
  if ([95, 96, 99].includes(code)) return { description: "Thunderstorm", icon: "⛈️" };
  return { description: "Weather conditions", icon: "🌤️" };
}

// Format daily dates at local midday to avoid date shifts across time zones.
function formatForecastDate(dateString, options) {
  return new Intl.DateTimeFormat("en-US", options).format(new Date(`${dateString}T12:00:00`));
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message; // textContent is safer than innerHTML for user data.
  statusMessage.classList.toggle("is-error", isError);
  statusMessage.hidden = !message;
}

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  searchButtonText.textContent = isLoading ? "Loading..." : "Get weather";
  searchSpinner.hidden = !isLoading;
  searchForm.setAttribute("aria-busy", String(isLoading));
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

// STEP 6: Convert the API's JSON objects into visible HTML text.
function showWeather(city, data) {
  const current = data.current;
  const isDay = current.is_day === 1;
  const condition = getWeatherInfo(current.weather_code, isDay);

  // Current weather.
  setText("#current-heading", city.name);
  setText("#countryName", [city.admin1, city.country].filter(Boolean).join(", "));
  setText("#localTime", `${(current.time || "").split("T")[1] || "Now"} local`);
  setText("#temperature", `${Math.round(current.temperature_2m)}°`);
  setText("#weatherDescription", condition.description);
  setText("#feelsLike", `${Math.round(current.apparent_temperature)}°C`);
  setText("#conditionSummary", `${condition.description} in ${city.name} today`);
  setText("#humidity", `${Math.round(current.relative_humidity_2m)}%`);
  setText("#windSpeed", `${Math.round(current.wind_speed_10m)} km/h`);
  setText("#precipitation", `${current.precipitation} mm`);
  setText("#weatherIcon", condition.icon);
  document.querySelector("#weatherIcon").setAttribute("aria-label", condition.description);
  document.body.dataset.theme = isDay ? "day" : "night";

  // Daily forecast: create DOM nodes (rather than inserting untrusted HTML).
  forecastList.replaceChildren();
  const days = data.daily.time;
  days.forEach((date, index) => {
    const info = getWeatherInfo(data.daily.weather_code[index]);
    const article = document.createElement("article");
    article.className = "forecast-day";

    const dayName = document.createElement("p");
    dayName.className = "forecast-name";
    dayName.textContent = index === 0 ? "Today" : formatForecastDate(date, { weekday: "short" });

    const calendarDate = document.createElement("p");
    calendarDate.className = "forecast-date";
    calendarDate.textContent = formatForecastDate(date, { month: "short", day: "numeric" });

    const icon = document.createElement("p");
    icon.className = "forecast-icon";
    icon.textContent = info.icon;
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", info.description);

    const description = document.createElement("p");
    description.className = "forecast-condition";
    description.textContent = info.description;

    const temps = document.createElement("div");
    temps.className = "forecast-temps";
    const high = document.createElement("span");
    high.textContent = `${Math.round(data.daily.temperature_2m_max[index])}°`;
    const low = document.createElement("span");
    low.className = "forecast-low";
    low.textContent = `${Math.round(data.daily.temperature_2m_min[index])}°`;
    temps.append(high, low);

    article.append(dayName, calendarDate, icon, description, temps);
    forecastList.append(article);
  });

  emptyState.hidden = true;
  weatherPanel.hidden = false;
}

// STEP 7: The main async function connects all of the steps.
async function searchWeather(cityName) {
  const cleanCity = cityName.trim();
  if (!cleanCity) {
    setStatus("Please enter a city name.", true);
    cityInput.focus();
    return;
  }

  // Abort an old request to prevent an older result replacing the new search.
  if (activeController) activeController.abort();
  const controller = new AbortController();
  activeController = controller;

  setLoading(true);
  setStatus(`Finding weather for ${cleanCity}...`);

  try {
    // These requests are sequential: get coordinates first, then use them.
    const city = await findCity(cleanCity, controller.signal);
    const weather = await getWeather(city.latitude, city.longitude, controller.signal);
    showWeather(city, weather);
    setStatus("");
  } catch (error) {
    // A canceled search is normal: do not display an error for it.
    if (error.name !== "AbortError") {
      setStatus(error.message || "Something went wrong. Please try again.", true);
    }
  } finally {
    // An older request must not switch off the new request's loading state.
    if (activeController === controller) {
      setLoading(false);
      activeController = null;
    }
  }
}

// STEP 8: Listen to form submission and suggested-city clicks.
searchForm.addEventListener("submit", (event) => {
  event.preventDefault(); // Prevent the browser from reloading the page.
  searchWeather(cityInput.value);
});

document.querySelectorAll(".city-chip").forEach((button) => {
  button.addEventListener("click", () => {
    cityInput.value = button.dataset.city;
    searchWeather(cityInput.value);
  });
});

// Optional starter experience: show Karachi when the page first loads.
cityInput.value = "Karachi";
searchWeather("Karachi");