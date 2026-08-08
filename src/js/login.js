import { supabase } from './supabaseClient.js';

const form = document.getElementById('loginForm');
const errorBox = document.getElementById('authError');
const submitBtn = document.getElementById('submitBtn');

// If already logged in, go straight to dashboard.
supabase.auth.getSession().then(({ data }) => {
  if (data.session) window.location.href = '/index.html';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in…';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    errorBox.textContent = error.message;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
    return;
  }
  window.location.href = '/index.html';
});
