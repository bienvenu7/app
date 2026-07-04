/**
 * Import Examples with @ Aliases
 *
 * This file demonstrates the proper usage of @ imports
 * configured in the project for clean and consistent imports.
 */

// ✅ RECOMMENDED: Use @ aliases for clean imports
import { getOptimizedImageUrl } from '@/utils/assets';
import { debugLog, getApiUrl } from '@/utils/config';
// import { OptimizedImage } from '@/components/OptimizedImage';

// ✅ RECOMMENDED: Specific @ aliases for better organization
// import { OptimizedImage } from '@/components/OptimizedImage';
// import { config } from '@/utils/config';
// import { getOptimizedImageUrl } from '@/utils/assets';

// ✅ RECOMMENDED: For assets and static files
// import logoImage from '@/assets/logo.png';
// import heroImage from '@/assets/images/hero.jpg';

// ✅ RECOMMENDED: For types and interfaces
// import type { User } from '@/types/user';
// import type { ApiResponse } from '@/types/api';

// ✅ RECOMMENDED: For hooks
// import { useAuth } from '@/hooks/useAuth';
// import { useLocalStorage } from '@/hooks/useLocalStorage';

// ✅ RECOMMENDED: For providers and context
// import { AuthProvider } from '@/providers/AuthProvider';
// import { ThemeProvider } from '@/providers/ThemeProvider';

// ✅ RECOMMENDED: For Redux/store
// import { store } from '@/redux/store';
// import { useAppSelector } from '@/redux/hooks';

// ✅ RECOMMENDED: For styles
import '@/styles/components.css';
import '@/styles/globals.css';

// ❌ AVOID: Relative imports (harder to maintain)
// import { config } from '../utils/config';
// import { OptimizedImage } from '../components/OptimizedImage';

// ❌ AVOID: Deep relative imports
// import { config } from '../../../utils/config';

/**
 * Example usage of the imported modules
 */
export const exampleUsage = () => {
  // Use config
  const apiUrl = getApiUrl('/users');
  debugLog('API URL:', apiUrl);

  // Use asset utilities
  const optimizedImageUrl = getOptimizedImageUrl('/images/photo.jpg', {
    width: 400,
    height: 300,
    quality: 85,
  });

  return {
    apiUrl,
    optimizedImageUrl,
  };
};

/**
 * Example React component with proper imports
 * Note: This is a TypeScript file, so JSX examples are commented out
 */
export const ExampleComponent = () => {
  // Example JSX usage (would be in a .tsx file):
  // return (
  //   <div>
  //     <OptimizedImage
  //       src="/images/hero.jpg"
  //       alt="Hero image"
  //       width={800}
  //       height={600}
  //     />
  //   </div>
  // );

  return null; // Placeholder for TypeScript file
};
