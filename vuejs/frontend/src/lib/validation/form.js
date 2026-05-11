// Mini hook di validazione form basato su yup. Sostituto di vee-validate@4
// che ha API specifica Vue 3 e non e' portabile su Vue 2.7.
//
// Funziona su entrambi i build perche' usa solo `reactive`/`ref` (disponibili
// sia in Vue 3 sia in Vue 2.7 + Composition API).
//
// Uso tipico:
//   const { values, errors, isSubmitting, handleSubmit } = useFormState({
//     schema: yup.object({ email: yup.string().required().email() }),
//     initialValues: { email: '' },
//     onSubmit: async (vals, { reset }) => { ... await fetch ...; reset({}) }
//   })
//
//   <form @submit.prevent="handleSubmit">
//     <input v-model="values.email" />
//     <span v-if="errors.email">{{ errors.email }}</span>
//   </form>

import { reactive, ref } from 'vue';

export function useFormState({ schema = null, initialValues = {}, onSubmit = null } = {}) {
  const values = reactive({ ...initialValues });
  const errors = reactive({});
  const isSubmitting = ref(false);

  const clearErrors = () => {
    Object.keys(errors).forEach((k) => { delete errors[k]; });
  };

  const setError = (field, message) => {
    errors[field] = message;
  };

  const setErrorsFromYup = (err) => {
    if (err && Array.isArray(err.inner) && err.inner.length) {
      err.inner.forEach((e) => {
        if (e.path && !errors[e.path]) errors[e.path] = e.message;
      });
    } else if (err && err.path) {
      errors[err.path] = err.message;
    }
  };

  const reset = (next = {}) => {
    Object.keys(values).forEach((k) => { delete values[k]; });
    Object.assign(values, initialValues, next);
    clearErrors();
  };

  const validate = async () => {
    clearErrors();
    if (!schema) return true;
    try {
      await schema.validate(values, { abortEarly: false });
      return true;
    } catch (err) {
      setErrorsFromYup(err);
      return false;
    }
  };

  const validateField = async (field) => {
    if (!schema) return true;
    delete errors[field];
    try {
      await schema.validateAt(field, values);
      return true;
    } catch (err) {
      if (err && err.path) errors[err.path] = err.message;
      return false;
    }
  };

  const handleSubmit = async (event) => {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (isSubmitting.value) return;
    const ok = await validate();
    if (!ok) return;
    if (typeof onSubmit !== 'function') return;
    isSubmitting.value = true;
    try {
      await onSubmit(values, { reset, setError, clearErrors });
    } finally {
      isSubmitting.value = false;
    }
  };

  return {
    values,
    errors,
    isSubmitting,
    validate,
    validateField,
    handleSubmit,
    reset,
    setError,
    clearErrors,
  };
}
