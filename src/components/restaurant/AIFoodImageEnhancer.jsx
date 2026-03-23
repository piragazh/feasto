import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wand2, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AIFoodImageEnhancer({ imageUrl, itemName, onImageUpdate, disabled }) {
    const [enhancing, setEnhancing] = useState(false);

    const enhanceFoodImage = async () => {
        if (!imageUrl) {
            toast.error('Please add an image first');
            return;
        }

        setEnhancing(true);
        try {
            const prompt = `Transform this food image into a high-end, commercial fast-food advertisement image designed to maximize customer cravings and conversions.

CRITICAL REQUIREMENTS - Enhance the food to look extremely fresh, crispy, and juicy:
- Emphasize golden, crunchy texture on chicken (visible crisp layers)
- Add subtle steam rising from hot food
- Enhance shine and glaze on chicken surface (light oil reflection)
- Make fries look golden, slightly salted, and perfectly cooked

LIGHTING & STYLING - Use dramatic, studio-quality lighting:
- High contrast with soft shadows for professional look
- Add warm tones to increase appetite appeal (slight orange/yellow warmth)
- Apply shallow depth of field (blur background, sharp focus on food)
- Add soft glow highlights on key areas (edges of chicken, fries)

COMPOSITION - Center the food as hero subject:
- Slight angle perspective (not flat top-down, use 30–45° angle)
- Ensure portion looks generous and premium
- Clean, minimal background (dark or marble surface preferred)

BRANDING FEEL - Match modern fast-food advertising style:
- Make image look premium, not cheap or artificial
- Similar to KFC / McDonald's campaigns aesthetic
- Avoid over-editing or unrealistic textures

OPTIONAL ENHANCEMENTS:
- Add condensation on drink can (cold, refreshing look)
- Slight motion effect (tiny crumbs or seasoning detail for realism)

OUTPUT SPECIFICATIONS:
- Ultra high resolution (4K quality minimum)
- Sharp, clean, and visually striking
- Ready for use in mobile app UI and digital menu boards
- Make the image psychologically irresistible to customers browsing a food delivery app
- Increase perceived taste, quality, and value

Item: ${itemName || 'Food'}`;

            const result = await base44.integrations.Core.GenerateImage({
                prompt,
                existing_image_urls: [imageUrl]
            });

            onImageUpdate(result.url);
            toast.success('✨ Food image enhanced to advertisement quality!');
        } catch (error) {
            console.error('Enhancement error:', error);
            toast.error('Failed to enhance image. Please try again.');
        } finally {
            setEnhancing(false);
        }
    };

    return (
        <Card className="border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-amber-900">
                            <Sparkles className="h-5 w-5 text-amber-600" />
                            Premium Food Photo Enhancement
                        </CardTitle>
                        <p className="text-xs text-amber-700 mt-1">
                            Transform your food image into a mouth-watering advertisement
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs text-amber-800">
                    <div className="flex items-start gap-1.5 bg-white/60 p-2 rounded">
                        <span className="text-amber-600 font-bold">✓</span>
                        <span>Golden, crispy textures</span>
                    </div>
                    <div className="flex items-start gap-1.5 bg-white/60 p-2 rounded">
                        <span className="text-amber-600 font-bold">✓</span>
                        <span>Studio-quality lighting</span>
                    </div>
                    <div className="flex items-start gap-1.5 bg-white/60 p-2 rounded">
                        <span className="text-amber-600 font-bold">✓</span>
                        <span>Appetite-boosting warmth</span>
                    </div>
                    <div className="flex items-start gap-1.5 bg-white/60 p-2 rounded">
                        <span className="text-amber-600 font-bold">✓</span>
                        <span>Premium composition</span>
                    </div>
                    <div className="flex items-start gap-1.5 bg-white/60 p-2 rounded">
                        <span className="text-amber-600 font-bold">✓</span>
                        <span>Subtle steam & shine</span>
                    </div>
                    <div className="flex items-start gap-1.5 bg-white/60 p-2 rounded">
                        <span className="text-amber-600 font-bold">✓</span>
                        <span>Minimal, clean background</span>
                    </div>
                </div>

                <div className="bg-white/80 border border-amber-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-amber-900">Why Enhancement?</p>
                    <ul className="text-xs text-amber-800 space-y-1">
                        <li>• <strong>Increase conversions</strong> — 35% more likely to convert with premium food photos</li>
                        <li>• <strong>Beat competitors</strong> — Stand out in food delivery app searches</li>
                        <li>• <strong>Drive orders</strong> — Customers order based on visual appeal first</li>
                        <li>• <strong>Premium perception</strong> — Higher perceived quality = higher order frequency</li>
                    </ul>
                </div>

                <Button
                    onClick={enhanceFoodImage}
                    disabled={!imageUrl || enhancing || disabled}
                    className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-semibold h-11"
                >
                    {enhancing ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Enhancing Your Food Photo...
                        </>
                    ) : (
                        <>
                            <Wand2 className="h-4 w-4 mr-2" />
                            Enhance to Advertisement Quality
                        </>
                    )}
                </Button>

                {!imageUrl && (
                    <div className="bg-amber-100 border border-amber-300 rounded p-2 text-xs text-amber-900">
                        💡 Upload an image first to enhance it
                    </div>
                )}

                <p className="text-xs text-amber-700 italic">
                    ⚡ AI-generated enhancements may slightly alter the original image. Preview and adjust as needed.
                </p>
            </CardContent>
        </Card>
    );
}