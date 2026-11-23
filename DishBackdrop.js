import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import { recipePhotos } from './recipePhotos';

const photosByTheme = {
  day: [recipePhotos.carbonara[0], recipePhotos.manti[0], recipePhotos.cucumber[0],
    recipePhotos.pie[0], recipePhotos.corn[0]],
  night: [recipePhotos.ribs[0], recipePhotos.turkey[0], recipePhotos.eggplant[0],
    recipePhotos.fish[0], recipePhotos.belyashi[0]],
};
const slideDuration = 5000;
const fadeDuration = 950;

export default function DishBackdrop({ themeName }) {
  const isDay = themeName === 'day';
  const photos = photosByTheme[themeName];
  const [reduceMotion, setReduceMotion] = useState(true);
  const [slide, setSlide] = useState(() => ({
    current: 0, startedAt: Date.now(), opacity: new Animated.Value(0),
  }));
  const next = (slide.current + 1) % photos.length;
  const [loadedNext, setLoadedNext] = useState(null);

  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (active) setReduceMotion(enabled);
    }).catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion || loadedNext !== slide) return;
    slide.opacity.setValue(0);
    const animation = Animated.timing(slide.opacity, {
      toValue: 1,
      duration: fadeDuration,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web',
      isInteraction: false,
    });
    const delay = Math.max(0, slide.startedAt + slideDuration - fadeDuration - Date.now());
    const timer = setTimeout(() => animation.start(({ finished }) => {
      if (finished) setSlide({ current: next, startedAt: Date.now(), opacity: new Animated.Value(0) });
    }), delay);
    return () => {
      clearTimeout(timer);
      animation.stop();
    };
  }, [slide, next, loadedNext, reduceMotion]);

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.backdrop, isDay && styles.dayBackdrop]}>
      <Animated.View key={slide.current} style={StyleSheet.absoluteFill}>
        <Image source={photos[slide.current]} blurRadius={2} resizeMode="cover" style={styles.image} />
      </Animated.View>
      {!reduceMotion && (
        <Animated.View key={next} style={[StyleSheet.absoluteFill, { opacity: slide.opacity }]}>
          <Image source={photos[next]} blurRadius={2} resizeMode="cover" style={styles.image}
            onLoadEnd={() => setLoadedNext(slide)} />
        </Animated.View>
      )}
      <View style={[styles.shade, isDay && styles.dayShade]} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#241521', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  dayBackdrop: { backgroundColor: '#FFF5E5' },
  shade: { ...StyleSheet.absoluteFill, zIndex: 2, backgroundColor: 'rgba(39, 19, 34, 0.65)' },
  dayShade: { backgroundColor: 'rgba(255, 242, 214, 0.48)' },
});
