import { mount } from 'svelte';
import App from './App.svelte';
import './styles.css';

const target = document.getElementById('terrain-lab');
if (!target) throw new Error('Terrain lab mount point is missing');

mount(App, { target });
