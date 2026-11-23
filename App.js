import React, { createContext, useCallback, useContext, useMemo, useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, AppState, BackHandler, Easing, FlatList, Image, Keyboard, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recipes as publishedRecipes, recipeDrafts, scaledAmount } from './recipes';
import { useFonts } from 'expo-font';
import AppearanceSettings, { accentColors, defaultAppearance, fontFamilies, parseAppearance } from './AppearanceSettings';
import DishBackdrop from './DishBackdrop';
import useCookingTimer from './useCookingTimer';
import useRecipeProgress from './useRecipeProgress';
import { recipePhotos } from './recipePhotos';
import { recipeThumbnails } from './recipeThumbnails';

const ThemeContext = createContext(null);
const modalOrientations = ['portrait', 'landscape-left', 'landscape-right'];
const lastRecipeKey = 'vadyaway:last-recipe:v1';
const appearanceKey = 'vadyaway:appearance:v1';
const themeStorageKey = 'vadyaway:theme:v1';
const storageKey = 'vadyaway:favorites:v1';
const recipes = __DEV__ ? [...publishedRecipes, ...recipeDrafts] : publishedRecipes;
const categories = ['Все', ...new Set(recipes.map(recipe => recipe.category))];
const recipeIds = new Set(recipes.map(recipe => recipe.id));

function Button({ label, onPress, selected, disabled, accessibilityLabel }) {
  const { styles } = useContext(ThemeContext);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        selected && styles.selected,
        (pressed || disabled) && styles.dim,
      ]}
    >
      <Text style={[styles.buttonText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

const instagramProfile = 'https://www.instagram.com/vadyaway99/';
const tiktokProfile = 'https://www.tiktok.com/@crockbrother';

function SocialLink({ name, url, children }) {
  const { styles } = useContext(ThemeContext);
  async function openProfile() {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Не удалось открыть профиль', 'Попробуй ещё раз.');
    }
  }

  return (
    <Pressable accessibilityRole="link" accessibilityLabel={name}
      accessibilityState={{ disabled: !url }} disabled={!url} onPress={openProfile}
      style={({ pressed }) => [styles.socialLink, (!url || pressed) && styles.dim]}>
      {children}
    </Pressable>
  );
}

function RecipePhoto({ source, maxHeight, style }) {
  const { styles } = useContext(ThemeContext);
  if (!source) return null;
  const dimensions = Image.resolveAssetSource?.(source) ?? source;
  const aspectRatio = dimensions.width && dimensions.height
    ? dimensions.width / dimensions.height
    : 4 / 3;

  return (
    <View style={[styles.recipePhotoFrame, style, {
      aspectRatio,
      maxHeight,
    }]}>
      <Image source={source} resizeMode="contain" style={styles.recipePhoto} />
    </View>
  );
}

function RecipeCard({ recipe, favorite, onOpen, onFavorite }) {
  const { styles } = useContext(ThemeContext);
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" onPress={onOpen}
        style={({ pressed }) => [styles.cardBody, pressed && styles.dim]}>
        <Image source={recipeThumbnails[recipe.id] ?? recipePhotos[recipe.id][0]} resizeMode="cover" style={styles.recipeThumbnail} />
        <View style={styles.flex}>
          <Text style={styles.meta}>{recipe.category}{recipe.minutes ? ' · ' + recipe.minutes + ' мин' : ''}</Text>
          <Text style={styles.cardTitle}>{recipe.name}</Text>
        </View>
      </Pressable>
      <Button label={favorite ? '♥' : '♡'} selected={favorite} onPress={onFavorite}
        accessibilityLabel={favorite ? 'Убрать из избранного' : 'В избранное'} />
    </View>
  );
}

function CookingTimer({ recipe, cookingTimer, presetMinutes, alternateMinutes }) {
  const { styles } = useContext(ThemeContext);
  const [minutes, setMinutes] = useState(() => String(presetMinutes));
  const { timer, seconds, busy, message, start, cancel } = cookingTimer;
  const duration = Number(minutes);
  const valid = Number.isInteger(duration) && duration >= 1 && duration <= 999;
  const hours = Math.floor(seconds / 3600);
  const remainingMinutes = Math.floor(seconds / 60) % 60;
  const remainingSeconds = String(seconds % 60).padStart(2, '0');
  const remaining = hours
    ? hours + ':' + String(remainingMinutes).padStart(2, '0') + ':' + remainingSeconds
    : remainingMinutes + ':' + remainingSeconds;

  return (
    <View style={styles.hero}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Таймер готовки</Text>
      {timer ? (
        <>
          <Text style={styles.meta}>{timer.recipeName}</Text>
          <Text style={styles.heading}>{remaining}</Text>
          <Button label="Отменить таймер" onPress={cancel} disabled={busy} />
        </>
      ) : (
        <View style={styles.servings}>
          <TextInput accessibilityLabel="Длительность таймера в минутах"
            style={[styles.search, styles.timerInput]} keyboardType="number-pad"
            maxLength={3} value={minutes} onChangeText={value => setMinutes(value.replace(/[^0-9]/g, ''))} />
          <Text style={styles.body}>мин{valid && duration >= 60 ? ' · ' + Math.floor(duration / 60) + ' ч' + (duration % 60 ? ' ' + duration % 60 + ' мин' : '') : ''}</Text>
          <Button label="Запустить" selected disabled={!valid || busy}
            onPress={() => { Keyboard.dismiss(); start(duration, recipe.name); }} />
        </View>
      )}
      {!timer && alternateMinutes && (
        <Button label="Запекание костей · 1 ч" disabled={busy}
          onPress={() => setMinutes(String(alternateMinutes))} />
      )}
      {!!message && <Text accessibilityLiveRegion="polite" style={styles.meta}>{message}</Text>}
    </View>
  );
}

let shoppingWrites = Promise.resolve();

function ShoppingList({ recipe, servings }) {
  const { styles } = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  const [bought, setBought] = useState(null);
  const [issue, setIssue] = useState('');
  const current = useRef([]);
  const key = 'vadyaway:shopping:v1:' + recipe.id;

  useEffect(() => {
    if (!open || bought !== null) return;
    let active = true;
    shoppingWrites.then(() => AsyncStorage.getItem(key)).then(raw => {
      if (!active) return;
      const saved = raw === null ? [] : JSON.parse(raw);
      current.current = Array.isArray(saved) ? saved : [];
      setBought(current.current);
    }).catch(() => {
      if (active) {
        setBought([]);
        setIssue('Не удалось загрузить сохранённые отметки.');
      }
    });
    return () => { active = false; };
  }, [open, bought, key]);

  function toggle(name) {
    const previous = current.current;
    const next = previous.includes(name) ? previous.filter(item => item !== name) : [...previous, name];
    current.current = next;
    setBought(next);
    setIssue('');
    shoppingWrites = shoppingWrites.then(() => AsyncStorage.setItem(key, JSON.stringify(next)))
      .catch(() => setIssue('Не удалось сохранить отметки.'));
  }

  const close = () => setOpen(false);

  return (
    <>
      <Button label="Список закупок" selected={open} onPress={() => setOpen(true)} />
      <Modal supportedOrientations={modalOrientations} visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.shoppingOverlay}>
          <View style={[styles.hero, styles.shoppingDialog]} accessibilityViewIsModal>
            <View style={styles.between}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Список закупок</Text>
              <Button label="Закрыть" onPress={close} />
            </View>
            <ScrollView style={styles.shoppingScroll}>
              {bought === null ? <Text style={styles.body}>Загрузка…</Text> :
                recipe.ingredients.map(([name, amount, unit]) => {
                  const checked = bought.includes(name);
                  return (
                    <Pressable key={name} accessibilityRole="checkbox" accessibilityState={{ checked }}
                      onPress={() => toggle(name)} style={styles.shoppingRow}>
                      <View style={[styles.shoppingCheck, checked && styles.shoppingChecked]}>
                        {checked && <Text style={styles.selectedText}>✓</Text>}
                      </View>
                      <Text style={[styles.body, styles.flex, checked && styles.bought]}>{name}</Text>
                      {amount !== undefined && (
                        <Text style={[styles.meta, styles.ingredientAmount, checked && styles.bought]}>
                          {scaledAmount(amount, recipe.servings, servings, unit === 'шт.' && /^(яйц|желтк)/i.test(name))} {unit}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              {!!issue && <Text accessibilityLiveRegion="polite" style={styles.meta}>{issue}</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function CookingMode({ recipe, servings, stepIndex, onStepChange, onComplete, onClose, cookingTimer, photoMaxHeight }) {
  const { styles } = useContext(ThemeContext);
  const scroll = useRef(null);
  const presetMinutes = recipe.stepTimers?.[stepIndex];
  const lastStep = stepIndex === recipe.steps.length - 1;

  function goTo(index) {
    onStepChange(index);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  return (
    <Modal animationType="slide" supportedOrientations={modalOrientations} onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={[styles.cookBar, styles.cookHeader]}>
          <Button label="‹ Рецепт" onPress={onClose} accessibilityLabel="Вернуться к рецепту" />
          <Text accessibilityLiveRegion="polite" style={styles.meta}>
            Шаг {stepIndex + 1} из {recipe.steps.length}
          </Text>
        </View>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, styles.detailContent]}>
          <RecipePhoto source={recipePhotos[recipe.id][stepIndex + 1]} maxHeight={photoMaxHeight} />
          {!lastStep && (
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={styles.preloadedPhoto}>
              <Image source={recipePhotos[recipe.id][stepIndex + 2]} style={styles.recipePhoto} />
            </View>
          )}
          <Text style={styles.cookInstruction}>{recipe.steps[stepIndex]}</Text>
          <View style={styles.hero}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Для этого шага</Text>
            {recipe.stepIngredients[stepIndex].map((item, index) => {
              const [name, amount, unit] = typeof item === 'number' ? recipe.ingredients[item] : [item];
              return (
                <View key={index} style={[styles.between, styles.ingredient]}>
                  <Text style={[styles.body, styles.flex]}>{name}</Text>
                  {amount !== undefined && (
                    <Text style={[styles.meta, styles.ingredientAmount]}>
                      {scaledAmount(amount, recipe.servings, servings)} {unit}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
          {!!presetMinutes && (
            <CookingTimer key={stepIndex} recipe={recipe} cookingTimer={cookingTimer}
              presetMinutes={presetMinutes} alternateMinutes={recipe.id === 'demi' && stepIndex === 0 ? 60 : null} />
          )}
        </ScrollView>
        <View style={styles.cookBar}>
          <Button label="Назад" disabled={stepIndex === 0} onPress={() => goTo(stepIndex - 1)} />
          <Button label={lastStep ? 'Завершить' : 'Далее'} selected onPress={() => {
            onComplete(stepIndex);
            if (lastStep) onClose();
            else goTo(stepIndex + 1);
          }} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function RecipeNutrition({ nutrition }) {
  const { styles } = useContext(ThemeContext);
  const { protein, fat, carbs, basis } = nutrition;
  const calories = Math.round((protein * 4 + fat * 9 + carbs * 4) / 10) * 10;
  const metrics = [
    ['Калории', calories + ' ккал'],
    ['Белки', protein + ' г'],
    ['Жиры', fat + ' г'],
    ['Углеводы', carbs + ' г'],
  ];

  return (
    <View style={styles.hero}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Калории и БЖУ</Text>
      <Text style={styles.meta}>Ориентировочно · {basis}</Text>
      <View style={styles.nutritionMetrics}>
        {metrics.map(([label, value]) => (
          <View key={label} style={styles.nutritionMetric}>
            <Text style={styles.meta}>{label}</Text>
            <Text style={styles.nutritionValue}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function RecipeDetails({ recipe, favorite, onFavorite, onBack, cookingTimer, initialVisit, onVisitChange }) {
  const { styles } = useContext(ThemeContext);
  const { progress, updateProgress } = useRecipeProgress(recipe);
  const servings = progress?.servings ?? recipe.servings;
  const [cookingStep, setCookingStep] = useState(initialVisit.stepIndex);
  const detailScroll = useRef(null);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const restoreOffset = useRef(initialVisit.offset);

  function restoreScroll() {
    if (!restoreOffset.current || !viewportHeight.current || !contentHeight.current) return;
    const maxOffset = Math.max(0, contentHeight.current - viewportHeight.current);
    const offset = Math.min(restoreOffset.current, maxOffset);
    restoreOffset.current = 0;
    detailScroll.current?.scrollTo({ y: offset, animated: false });
  }

  function showCookingStep(stepIndex) {
    setCookingStep(stepIndex);
    onVisitChange({ stepIndex });
  }
  const { width, height } = useWindowDimensions();
  const photoMaxHeight = Math.floor(Math.min(height * (height < 700 ? 0.40 : 0.48), 440));
  const offset = useRef(new Animated.Value(0)).current;
  const transitioning = useRef(false);

  useEffect(() => () => offset.stopAnimation(), [offset]);
  const swipe = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) =>
      !transitioning.current && gesture.numberActiveTouches === 1 && gesture.dx > 18 && gesture.dx > Math.abs(gesture.dy) * 2,
    onPanResponderMove: (_, { dx }) => offset.setValue(Math.min(width, Math.max(0, dx))),
    onPanResponderTerminate: () => {
      Animated.spring(offset, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start();
    },
    onPanResponderRelease: (_, { dx, dy, vx }) => {
      if (dx < 60 || dx < Math.abs(dy) * 2) {
        Animated.spring(offset, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start();
        return;
      }
      const speed = Math.max(0.7, vx);
      transitioning.current = true;
      Animated.timing(offset, {
        toValue: width,
        duration: Math.max(70, Math.min(300, (width - dx) / speed)),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }).start(({ finished }) => {
        if (!finished) {
          transitioning.current = false;
          return;
        }
        onBack();
      });
    },
  }), [offset, onBack, width]);
  return (
    <View style={[styles.flex, { overflow: 'hidden' }]} {...swipe.panHandlers}>
    <Animated.View style={[styles.flex, { backgroundColor: styles.screen.backgroundColor, transform: [{ translateX: offset }] }]}>
    <ScrollView ref={detailScroll} keyboardShouldPersistTaps="handled" directionalLockEnabled
      contentContainerStyle={[styles.content, styles.detailContent]} scrollEventThrottle={64}
      onLayout={({ nativeEvent }) => { viewportHeight.current = nativeEvent.layout.height; restoreScroll(); }}
      onContentSizeChange={(_, height) => { contentHeight.current = height; restoreScroll(); }}
      onScroll={({ nativeEvent }) => {
        if (!restoreOffset.current) onVisitChange({ offset: Math.max(0, nativeEvent.contentOffset.y) }, true);
      }}>
      <View style={styles.between}>
        <Button label="‹ Рецепты" onPress={onBack} accessibilityLabel="Вернуться к списку" />
        <Button label={favorite ? '♥ В избранном' : '♡ Сохранить'} selected={favorite} onPress={onFavorite} />
      </View>
      <RecipePhoto source={recipePhotos[recipe.id][0]} maxHeight={photoMaxHeight} style={styles.recipeCover} />
      <View style={styles.hero}>
        <Text style={styles.meta}>{recipe.category}{recipe.minutes ? ' · ' + recipe.minutes + ' мин' : ''}</Text>
        <Text accessibilityRole="header" style={styles.heading}>{recipe.name}</Text>
        {!!recipe.description && <Text style={styles.body}>{recipe.description}</Text>}
      </View>
      {recipe.nutrition && <RecipeNutrition nutrition={recipe.nutrition} />}
      <Text accessibilityRole="header" style={styles.sectionTitle}>Ингредиенты</Text>
      {!!recipe.servings && <View style={styles.servings}>
        <Button label="−" accessibilityLabel="Уменьшить число порций"
          onPress={() => updateProgress(previous => ({ ...previous, servings: Math.max(1, previous.servings - 1) }))} disabled={!progress || servings === 1} />
        <Text accessibilityLiveRegion="polite" style={styles.body}>Порций: {servings}</Text>
        <Button label="+" accessibilityLabel="Увеличить число порций"
          onPress={() => updateProgress(previous => ({ ...previous, servings: Math.min(12, previous.servings + 1) }))} disabled={!progress || servings === 12} />
      </View>}
      {recipe.ingredients.map(([name, amount, unit]) => (
        <View key={name} style={[styles.between, styles.ingredient]}>
          <Text style={[styles.body, styles.flex]}>{name}</Text>
          <Text style={[styles.meta, styles.ingredientAmount]}>
            {amount === undefined ? (/^(соль|перец)$/i.test(name) || name === 'Соль и чёрный перец' ? 'по вкусу' : '') : scaledAmount(amount, recipe.servings, servings) + ' ' + unit}
          </Text>
        </View>
      ))}
      <Button label={progress?.stepIndex != null ? 'Продолжить готовить' : 'Готовить'}
        selected disabled={!progress} onPress={() => {
          const stepIndex = progress.stepIndex ?? 0;
          updateProgress(previous => ({ ...previous, stepIndex }));
          showCookingStep(stepIndex);
        }} />
      <ShoppingList recipe={recipe} servings={servings} />
    </ScrollView>
    </Animated.View>
    {cookingStep !== null && (
      <CookingMode recipe={recipe} servings={servings} stepIndex={cookingStep} photoMaxHeight={photoMaxHeight}
        cookingTimer={cookingTimer} onStepChange={stepIndex => {
          updateProgress(previous => ({ ...previous, stepIndex }));
          showCookingStep(stepIndex);
        }}
        onComplete={index => {
          if (index === recipe.steps.length - 1) {
            updateProgress(previous => ({ ...previous, stepIndex: null }));
          }
        }}
        onClose={() => showCookingStep(null)} />
    )}
    </View>
  );
}

const introPhrases = [
  'Что готовим?',
  'Что готовим сегодня?',
  'Что на стол?',
  'Что сегодня на столе?',
  'Что сегодня в меню?',
  'Какое блюдо выберем?',
  'Что будем готовить?',
  'Что хочется приготовить?',
  'Какой рецепт берём?',
  'Что у нас на кухне?',
  'Что будет вкусненького?',
  'Что подадим к столу?',
  'С какого рецепта начнём?',
  'Что сегодня пробуем?',
  'Какой рецепт на сегодня?',
  'Что будем подавать?',
  'Что выбираем на сегодня?',
  'Что хочется сегодня?',
  'Что бы такого приготовить?',
  'Что сегодня вкусного?',
  'Ну что, готовим?',
  'Чем себя побалуем?',
  'Что бы сейчас съесть?',
  'Чего душа просит?',
  'Что замутим на кухне?',
  'Что сообразим на ужин?',
  'Что бы вкусного наколдовать?',
  'Что приготовим для своих?',
  'Чем накормим домашних?',
  'Чего бы вкусненького?',
  'Что сделаем на скорую руку?',
  'Что сегодня жарим?',
  'Что отправим в духовку?',
  'Что сегодня печём?',
  'Что поставим на плиту?',
  'Что сегодня у нас на ужин?',
  'Чем сегодня угостим?',
  'Что приготовим вместе?',
  'Давай придумаем, что поесть.',
  'Как насчёт чего-нибудь вкусного?',
  'Что на завтрак?',
  'Что на обед?',
  'Что на ужин?',
  'Что испечём к чаю?',
  'Чем перекусим?',
  'Что подадим гостям?',
  'Какое блюдо поставим в центр стола?',
  'Что приготовим на двоих?',
  'Что взять с собой на работу?',
  'Чем порадовать близких?',
  'Что приготовить на выходных?',
  'Что приготовить после работы?',
  'Что приготовить заранее?',
  'Что приготовим, если гости уже на пороге?',
  'Хочется чего-нибудь домашнего?',
  'Хочется чего-нибудь острого?',
  'Хочется чего-нибудь хрустящего?',
  'Хочется чего-нибудь горячего?',
  'Что у нас на сладкое?',
  'Что приготовить, когда лень готовить?',
  'Какое блюдо сегодня на подаче?',
  'Что сегодня в меню от шефа?',
  'Чем сегодня удивим за столом?',
  'Что приготовим по секрету шефа?',
  'Какое блюдо повторим дома?',
  'Что приготовим как в ресторане?',
  'Какой рецепт проверим на кухне?',
  'С каким блюдом поэкспериментируем?',
  'Какую классику приготовим?',
  'Какую классику переделаем на свой лад?',
  'Какой вкус сегодня попробуем?',
  'Какую кухню сегодня пробуем?',
  'Что приготовим до золотистой корочки?',
  'Что сделаем из того, что есть?',
  'Что приготовим из остатков?',
  'Что приготовим в одной сковороде?',
  'Что успеем за 20 минут?',
  'Что приготовим из трёх ингредиентов?',
  'Что приготовим без духовки?',
  'Чем сегодня порадуем себя за столом?',
  'Меню на сегодня',
  'Рецепт дня',
  'Идеи для ужина',
  'Выбери блюдо на сегодня',
  'Найди свой рецепт',
  'Готовим вместе',
  'Пора готовить',
  'Готовим дома',
  'Давай приготовим вкусное',
  'Сегодня готовим по настроению',
  'Твой следующий рецепт',
  'Начни с любимого ингредиента',
  'Выбирай, что по вкусу',
  'Открой новый рецепт',
  'К столу!',
  'От холодильника до тарелки',
  'Идеи из того, что под рукой',
  'Вкусный план на вечер',
  'Рецепты для своих',
  'На кухню!',
];

function useIntroPhrase() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let active;
    let interval;
    const advance = () => setIndex(previous => (previous + 1) % introPhrases.length);

    function updateVisibility(nextActive) {
      if (nextActive === active) return;
      const resumed = active === false && nextActive;
      active = nextActive;
      clearInterval(interval);
      if (active) {
        if (resumed) advance();
        interval = setInterval(advance, 60_000);
      }
    }

    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const onVisibilityChange = () => updateVisibility(!document.hidden);
      onVisibilityChange();
      document.addEventListener('visibilitychange', onVisibilityChange);
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    }

    // AppState may be null briefly during a cold launch.
    updateVisibility(AppState.currentState === null || AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => updateVisibility(state === 'active'));
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return introPhrases[index];
}

function Cookbook({ themeName, appearance, onOpenSettings, onChangeTheme, settingsReady }) {
  const { styles, palette, tablet } = useContext(ThemeContext);
  const { top, bottom, left, right } = useSafeAreaInsets();
  const introPhrase = useIntroPhrase();
  const [introFontLoaded] = useFonts({ OwnHand: require('./assets/OwnHand.ttf') });
  const cookingTimer = useCookingTimer();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Все');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [recipe, setRecipe] = useState(null);
  const [lastVisit, setLastVisit] = useState(null);
  const visit = useRef(null);
  const openingVisit = useRef(null);
  const visitWrites = useRef(Promise.resolve());
  const visitTimeout = useRef(null);

  const persistVisit = useCallback(() => {
    clearTimeout(visitTimeout.current);
    const snapshot = visit.current;
    if (!snapshot) return;
    visitWrites.current = visitWrites.current
      .then(() => AsyncStorage.setItem(lastRecipeKey, JSON.stringify(snapshot)))
      .catch(error => console.warn('VadyaWay could not save the last recipe', error));
  }, []);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(lastRecipeKey).then(raw => {
      if (!active || visit.current || !raw) return;
      const saved = JSON.parse(raw);
      const item = recipes.find(candidate => candidate.id === saved?.recipeId);
      if (!item) return;
      const stepIndex = Number.isInteger(saved.stepIndex) && saved.stepIndex >= 0 &&
        saved.stepIndex < item.steps.length ? saved.stepIndex : null;
      const offset = Number.isFinite(saved.offset) ? Math.max(0, saved.offset) : 0;
      visit.current = { recipeId: item.id, stepIndex, offset };
      setLastVisit(visit.current);
    }).catch(error => console.warn('VadyaWay could not restore the last recipe', error));
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') persistVisit();
    });
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', persistVisit);
    }
    return () => {
      active = false;
      subscription.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', persistVisit);
      }
      if (visitTimeout.current !== null) clearTimeout(visitTimeout.current);
    };
  }, [persistVisit]);

  function openRecipe(item, savedVisit) {
    Keyboard.dismiss();
    const next = savedVisit ?? { recipeId: item.id, offset: 0, stepIndex: null };
    openingVisit.current = next;
    visit.current = next;
    setLastVisit(next);
    persistVisit();
    setRecipe(item);
  }

  function updateVisit(changes, delayed = false) {
    visit.current = { ...visit.current, ...changes };
    if (delayed) {
      clearTimeout(visitTimeout.current);
      visitTimeout.current = setTimeout(persistVisit, 200);
    } else {
      persistVisit();
    }
  }

  const closeRecipe = useCallback(() => {
    persistVisit();
    setLastVisit(visit.current);
    setRecipe(null);
  }, [persistVisit]);
  const lastRecipe = recipes.find(item => item.id === lastVisit?.recipeId);
  const [favorites, setFavorites] = useState([]);
  const [ready, setReady] = useState(false);
  const [storageIssue, setStorageIssue] = useState('');
  const currentFavorites = useRef([]);
  const writes = useRef(Promise.resolve());
  const canPersist = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey).then(raw => {
      if (!active) return;
      const values = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(values)) throw new Error('Invalid favorite list');
      currentFavorites.current = [...new Set(values.filter(id => recipeIds.has(id)))];
      canPersist.current = true;
      setFavorites(currentFavorites.current);
    }).catch(() => {
      if (active) setStorageIssue('Избранное доступно только до закрытия приложения.');
    }).finally(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!recipe || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRecipe();
      return true;
    });
    return () => subscription.remove();
  }, [recipe, closeRecipe]);

  function toggleFavorite(id) {
    if (!ready) return;
    const previous = currentFavorites.current;
    const updated = previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id];
    currentFavorites.current = updated;
    setFavorites(updated);
    if (!canPersist.current) return;
    writes.current = writes.current.then(async () => {
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
        setStorageIssue('');
      } catch {
        setStorageIssue('Не удалось сохранить изменения в избранном.');
      }
    });
  }

  const normalize = value => value.toLowerCase().replace(/ё/g, 'е');
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const visibleRecipes = recipes.filter(item => {
    const searchable = normalize([item.name, ...item.ingredients.map(([name]) => name)].join(' '));
    return (!favoritesOnly || favorites.includes(item.id)) &&
      (category === 'Все' || item.category === category) &&
      terms.every(term => searchable.includes(term));
  });

  const themeSwitch = (
    <Pressable accessibilityRole="switch" accessibilityLabel="Тёмная тема"
      accessibilityState={{ checked: themeName === 'night', disabled: !settingsReady }}
      disabled={!settingsReady} onPress={() => onChangeTheme(themeName === 'night' ? 'day' : 'night')}
      style={({ pressed }) => [styles.socialLink, pressed && styles.dim]}>
      <Text style={styles.themeIcon}>{themeName === 'day' ? '🍳' : '🥩'}</Text>
    </Pressable>
  );

  const socialIcons = (
    <View style={[styles.socialLinks, styles[appearance.icons + 'Icons']]}>
      {appearance.icons === 'right' && themeSwitch}
      <SocialLink name="TikTok" url={tiktokProfile}>
        <Text style={styles.tiktokIcon}>♪</Text>
      </SocialLink>
      <SocialLink name="Instagram" url={instagramProfile}>
        <View style={styles.instagramIcon}>
          <View style={styles.instagramLens} />
          <View style={styles.instagramDot} />
        </View>
      </SocialLink>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingLeft: left, paddingRight: right }]}>
      <StatusBar barStyle={themeName === 'day' ? 'dark-content' : 'light-content'} />
      <DishBackdrop key={themeName} themeName={themeName} />
      <View style={styles.flex}>
        <View style={styles.flex} pointerEvents={recipe ? 'none' : 'auto'}
          accessibilityElementsHidden={!!recipe} importantForAccessibility={recipe ? 'no-hide-descendants' : 'auto'}>
        <FlatList keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false} removeClippedSubviews={false}
          style={Platform.OS === 'ios' ? styles.edgeToEdgeFeed : styles.flex}
          contentContainerStyle={[styles.content, { paddingTop: styles.content.padding + top, paddingBottom: styles.content.paddingBottom + bottom }]}
          key={tablet ? 'tablet' : 'phone'} numColumns={tablet ? 2 : 1}
          columnWrapperStyle={tablet ? styles.catalogRow : undefined}
          data={visibleRecipes} keyExtractor={item => item.id} initialNumToRender={5}
          maxToRenderPerBatch={4} windowSize={3} extraData={favorites}
          renderItem={({ item }) => (
            <View style={tablet ? styles.catalogCell : undefined}>
              <RecipeCard recipe={item} favorite={favorites.includes(item.id)}
                onFavorite={() => toggleFavorite(item.id)}
                onOpen={() => openRecipe(item)} />
            </View>
          )}
          ListHeaderComponent={<View style={styles.catalogHeader}>
          {!!storageIssue && <Text accessibilityRole="alert" style={styles.notice}>{storageIssue}</Text>}
          <View style={styles.banner}>
            <View style={styles.brandRow}>
              <View style={styles.brandContent}>
                {appearance.icons === 'left' && socialIcons}
                <View accessibilityLabel="VadyaWay" style={styles.wordmark}>
                  <View style={styles.monogram}><Text style={styles.monogramText}>VW</Text></View>
                  <Text style={styles.brand}>VadyaWay</Text>
                </View>
                {appearance.icons !== 'right' && <View style={styles.rightIcons}>{themeSwitch}</View>}
                {appearance.icons !== 'left' && socialIcons}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Настройки"
                disabled={!settingsReady} onPress={() => { Keyboard.dismiss(); onOpenSettings(); }}
                style={({ pressed }) => [styles.socialLink, styles.settingsButton, (pressed || !settingsReady) && styles.dim]}>
                <Text style={styles.settingsIcon}>⚙</Text>
              </Pressable>
            </View>
            <Text accessibilityRole="header" style={[styles.heading, introFontLoaded && appearance.font === 'original' && styles.introHeading]}>{introPhrase}</Text>
          </View>
          {lastRecipe && (
            <Pressable accessibilityRole="button" onPress={() => openRecipe(lastRecipe, lastVisit)}
              style={({ pressed }) => [styles.lastRecipe, pressed && styles.dim]}>
              <Image source={recipeThumbnails[lastRecipe.id] ?? recipePhotos[lastRecipe.id][0]}
                resizeMode="cover" style={styles.recipeThumbnail} />
              <View style={styles.flex}>
                <Text style={styles.meta}>Последний просмотренный рецепт</Text>
                <Text style={styles.cardTitle}>{lastRecipe.name}</Text>
                {lastVisit.stepIndex !== null && (
                  <Text style={styles.meta}>Шаг {lastVisit.stepIndex + 1} из {lastRecipe.steps.length}</Text>
                )}
              </View>
              <Text style={styles.body}>→</Text>
            </Pressable>
          )}
          <View style={[styles.tabs, styles.controls]}>
            <Button label="Все рецепты" selected={!favoritesOnly} onPress={() => setFavoritesOnly(false)} />
            <Button label="♡ Избранное" selected={favoritesOnly} onPress={() => setFavoritesOnly(true)} />
          </View>
          <TextInput accessibilityLabel="Поиск по рецептам" placeholder="Блюдо или ингредиент"
            placeholderTextColor={palette.muted} style={styles.search} value={query} onChangeText={setQuery}
            autoCorrect={false} returnKeyType="search" />
          <View style={[styles.tabs, styles.controls]}>
            {categories.map(item => (
              <Button key={item} label={item} selected={category === item} onPress={() => setCategory(item)} />
            ))}
          </View>
          </View>}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.body}>
                {favoritesOnly && !favorites.length ? 'Здесь появятся сохранённые рецепты.' : 'По этому запросу рецептов нет.'}
              </Text>
              {(!!query || category !== 'Все') &&
                <Button label="Сбросить фильтры" onPress={() => { setQuery(''); setCategory('Все'); }} />}
            </View>
          }
        />
        </View>
        {recipe && (
          <View style={[StyleSheet.absoluteFill, { top, bottom }]}>
            <RecipeDetails key={recipe.id} recipe={recipe} cookingTimer={cookingTimer} favorite={favorites.includes(recipe.id)}
              onFavorite={() => toggleFavorite(recipe.id)} onBack={closeRecipe}
              initialVisit={openingVisit.current} onVisitChange={updateVisit} />
          </View>
        )}
      </View>
    </View>
  );
}

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'web' && !__DEV__ && typeof navigator !== 'undefined' &&
        'serviceWorker' in navigator) {
      navigator.serviceWorker.register('./vadya-offline.js').catch(error => {
        console.warn('VadyaWay offline cache could not start', error);
      });
    }
  }, []);
  const [themeName, setThemeName] = useState('night');
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appearance, setAppearance] = useState(defaultAppearance);
  const appearanceRef = useRef(defaultAppearance);
  const { width, height } = useWindowDimensions();
  const compact = width < 375;
  const tablet = width >= 700 && height >= 540;
  const short = height < 700;
  const theme = useMemo(() => {
    const palette = { ...palettes[themeName] };
    if (appearance.accent !== 'original') {
      palette.accent = accentColors[appearance.accent];
      palette.accentInk = '#171717';
    }
    return { palette, styles: createThemeStyles(palette, { compact, tablet, short }, appearance), tablet };
  }, [themeName, compact, tablet, short, appearance]);
  const themeWrites = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    Promise.allSettled([AsyncStorage.getItem(themeStorageKey), AsyncStorage.getItem(appearanceKey)])
      .then(([savedTheme, savedAppearance]) => {
        if (!active) return;
        if (savedTheme.value === 'day') setThemeName('day');
        if (savedAppearance.value) {
          try {
            appearanceRef.current = parseAppearance(savedAppearance.value);
            setAppearance(appearanceRef.current);
          } catch (error) {
            console.warn('Could not read appearance settings', error);
          }
        }
        setSettingsReady(true);
      });
    return () => { active = false; };
  }, []);

  function changeTheme(next) {
    setThemeName(next);
    themeWrites.current = themeWrites.current
      .then(() => AsyncStorage.setItem(themeStorageKey, next))
      .catch(() => {});
  }

  function changeAppearance(changes) {
    const next = { ...appearanceRef.current, ...changes };
    appearanceRef.current = next;
    setAppearance(next);
    themeWrites.current = themeWrites.current
      .then(() => AsyncStorage.setItem(appearanceKey, JSON.stringify(next)))
      .catch(() => {});
  }

  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={theme}>
        <Cookbook themeName={themeName} appearance={appearance} settingsReady={settingsReady}
          onChangeTheme={changeTheme} onOpenSettings={() => setSettingsOpen(true)} />
        {settingsOpen && (
          <AppearanceSettings appearance={appearance} onChange={changeAppearance}
            onClose={() => setSettingsOpen(false)}
            accent={palettes[themeName].accent} previewStyle={[theme.styles.heading, appearance.font === 'original' && theme.styles.introHeading]}
            supportedOrientations={modalOrientations} />
        )}
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}

function createThemeStyles({ ink, muted, surface, glass, glassLine, accent, accentInk, notice }, { compact, tablet, short }, { font, scale }) {
  const textSize = size => Math.round(size * scale / 100);
  const fontOverride = font === 'original' ? {} : { fontFamily: fontFamilies[font] };
  const padding = compact ? 12 : tablet ? 24 : 18;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: surface },
    content: { padding, paddingBottom: short ? 20 : 32, gap: compact ? 10 : 14,
      width: '100%', maxWidth: tablet ? 920 : 720, alignSelf: 'center' },
    detailContent: { maxWidth: 720 },
    catalogRow: { marginHorizontal: -6 },
    catalogCell: { width: '50%', paddingHorizontal: 6 },
    edgeToEdgeFeed: { flex: 1, overflow: 'visible' },
    catalogHeader: { gap: 14, marginBottom: 14 },
    banner: { backgroundColor: glass, borderWidth: 1, borderColor: glassLine, borderRadius: 24, padding: compact ? 12 : 24, gap: 8 },
    brandRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    brandContent: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    wordmark: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    monogram: { width: 40, height: 40, borderRadius: 12, backgroundColor: accent,
      alignItems: 'center', justifyContent: 'center' },
    monogramText: { color: accentInk, fontSize: 17, fontWeight: '900', letterSpacing: -0.7 },
    socialLinks: { flexDirection: 'row', gap: 4 },
    rightIcons: { marginLeft: 'auto' },
    leftIcons: { marginRight: 'auto' },
    belowIcons: { flexBasis: '100%' },
    settingsButton: { backgroundColor: glass },
    themeIcon: { fontSize: 22 },
    settingsIcon: { color: ink, fontSize: 22, lineHeight: 26 },
    socialLink: { width: 44, height: 44, borderRadius: 22, borderWidth: 1,
      borderColor: glassLine, alignItems: 'center', justifyContent: 'center' },
    tiktokIcon: { color: ink, fontSize: 25, lineHeight: 30, fontWeight: '900',
      textShadowColor: '#FE2C55', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 1 },
    instagramIcon: { width: 19, height: 19, borderWidth: 2, borderColor: ink, borderRadius: 5,
      justifyContent: 'center', alignItems: 'center' },
    instagramLens: { width: 8, height: 8, borderWidth: 1.5, borderColor: ink, borderRadius: 4 },
    instagramDot: { position: 'absolute', top: 2, right: 2, width: 2, height: 2,
      borderRadius: 1, backgroundColor: ink },
    brand: { color: ink, fontSize: textSize(21), fontWeight: '700', letterSpacing: 0.2,
      fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', ...fontOverride, flexShrink: 1 },
    heading: { ...fontOverride, fontSize: textSize(compact ? 26 : 32), fontWeight: '800', color: ink },
    introHeading: { fontFamily: 'OwnHand', fontSize: textSize(compact ? 30 : 36), fontWeight: 'normal' },
    sectionTitle: { ...fontOverride, fontSize: textSize(23), fontWeight: '800', color: ink, marginTop: 8 },
    body: { ...fontOverride, color: ink, fontSize: textSize(16), lineHeight: textSize(24) },
    meta: { ...fontOverride, color: muted, fontSize: textSize(14), fontWeight: '600' },
    button: { alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44,
      paddingHorizontal: compact ? 9 : 12, paddingVertical: 8, borderRadius: 24, borderWidth: 1, borderColor: glassLine, backgroundColor: glass },
    buttonText: { ...fontOverride, fontSize: textSize(14), color: ink, fontWeight: '700' },
    selected: { backgroundColor: accent, borderColor: accent },
    selectedText: { color: accentInk },
    dim: { opacity: 0.5 },
    tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    controls: { padding: 8, borderRadius: 16 },
    search: { ...fontOverride, borderWidth: 1, borderColor: glassLine, backgroundColor: glass,
      padding: 14, borderRadius: 15, color: ink, fontSize: textSize(16) },
    card: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, paddingRight: 10,
      backgroundColor: glass, borderWidth: 1, borderColor: glassLine },
    lastRecipe: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
      backgroundColor: glass, borderWidth: 1, borderColor: glassLine, borderRadius: 18 },
    cardBody: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10 },
    cardTitle: { ...fontOverride, color: ink, fontSize: textSize(17), fontWeight: '800', marginTop: 4 },
    flex: { flex: 1 },
    hero: { borderRadius: 24, padding: compact ? 14 : 22, gap: 12, backgroundColor: glass, borderWidth: 1, borderColor: glassLine },
    between: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    servings: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    ingredient: { paddingVertical: 6, borderBottomWidth: 1, borderColor: glassLine },
    ingredientAmount: { maxWidth: '48%', textAlign: 'right' },
    recipeThumbnail: { width: compact ? 52 : 64, height: compact ? 52 : 64, borderRadius: 12 },
    preloadedPhoto: { position: 'absolute', width: 1, height: 1, opacity: 0 },
    recipeCover: { borderRadius: 20 },
    recipePhotoFrame: { width: '100%', backgroundColor: surface, borderRadius: 12, overflow: 'hidden' },
    recipePhoto: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    empty: { gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 16, backgroundColor: glass },
    cookBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: padding, paddingVertical: 8, gap: 8, width: '100%',
      maxWidth: 720, alignSelf: 'center', flexWrap: 'wrap' },
    cookHeader: { paddingTop: short ? 12 : compact ? 28 : 44 },
    cookInstruction: { ...fontOverride, color: ink, fontSize: textSize(compact ? 20 : 23), lineHeight: textSize(compact ? 28 : 32), fontWeight: '600' },
    nutritionMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    nutritionMetric: { flexBasis: '42%', flexGrow: 1, gap: 4 },
    nutritionValue: { ...fontOverride, color: ink, fontSize: textSize(19), fontWeight: '700' },
    timerInput: { minWidth: 72, textAlign: 'center' },
    shoppingOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center',
      padding, backgroundColor: 'rgba(0, 0, 0, 0.68)' },
    shoppingDialog: { width: '100%', maxWidth: 540, maxHeight: '84%', backgroundColor: surface },
    shoppingScroll: { flexGrow: 0, flexShrink: 1 },
    shoppingCheck: { width: 24, height: 24, borderWidth: 1, borderColor: glassLine,
      borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    shoppingChecked: { backgroundColor: accent, borderColor: accent },
    shoppingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44,
      paddingVertical: 6, borderBottomWidth: 1, borderColor: glassLine },
    bought: { textDecorationLine: 'line-through', textDecorationColor: accent,
      color: ink, fontWeight: '800' },
    notice: { ...fontOverride, paddingHorizontal: 18, paddingVertical: 8, color: ink, backgroundColor: notice },
  });
}

const palettes = {
  day: {
    ink: '#321F16', muted: '#665047', surface: '#FFF5E5',
    glass: 'rgba(255, 248, 231, 0.94)', glassLine: 'rgba(92, 53, 25, 0.25)',
    accent: '#FFD46A', accentInk: '#392600', notice: '#F5DCA3',
  },
  night: {
    ink: '#FFF5EE', muted: '#E7D8E2', surface: '#241521',
    glass: 'rgba(64, 33, 51, 0.78)', glassLine: 'rgba(255, 224, 242, 0.28)',
    accent: '#CFFF4A', accentInk: '#182000', notice: '#543044',
  },
};

