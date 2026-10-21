import './style.css';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Arcade } from './arcade/shell';

const arcade = new Arcade(document.getElementById('app')!);

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  // Android back: close the open game, or leave the app from the library.
  App.addListener('backButton', () => {
    if (arcade.inGame) arcade.back();
    else void App.exitApp();
  }).catch(() => {});
}
