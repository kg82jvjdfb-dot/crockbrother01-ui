import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

let writes = Promise.resolve();

export default function useRecipeProgress(recipe) {
  const [progress, setProgress] = useState(null);
  const current = useRef(null);
  const key = 'vadyaway:progress:v1:' + recipe.id;

  useEffect(() => {
    let active = true;
    function load(saved) {
      if (!active) return;
      const validServings = Number.isInteger(saved?.servings) && saved.servings >= 1 && saved.servings <= 12;
      const validStep = Number.isInteger(saved?.stepIndex) && saved.stepIndex >= 0 && saved.stepIndex < recipe.steps.length;
      current.current = {
        servings: recipe.servings && validServings ? saved.servings : recipe.servings,
        stepIndex: validStep ? saved.stepIndex : null,
      };
      setProgress(current.current);
    }
    writes.then(() => AsyncStorage.getItem(key))
      .then(raw => load(JSON.parse(raw)))
      .catch(() => load(null));
    return () => { active = false; };
  }, [key, recipe]);

  function updateProgress(update) {
    if (!current.current) return;
    const next = update(current.current);
    current.current = next;
    setProgress(next);
    writes = writes.then(() => AsyncStorage.setItem(key, JSON.stringify(next)))
      .catch(error => console.warn('VadyaWay could not save recipe progress', error));
  }

  return { progress, updateProgress };
}
