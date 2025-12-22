import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-app-shell',
  imports: [CommonModule, IonicModule, RouterModule],
  templateUrl: './app-shell.page.html',
  styleUrls: ['./app-shell.page.scss'],
})
export class AppShellPage {}
