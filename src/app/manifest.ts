import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LMS — วิทยาการคำนวณ ม.3',
    short_name: 'LMS ม.3',
    description: 'ระบบจัดการการเรียนรู้ วิทยาการคำนวณและเทคโนโลยีสารสนเทศ',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#0f172a',
    orientation: 'portrait-primary',
    icons: [],
    categories: ['education', 'productivity'],
  };
}
