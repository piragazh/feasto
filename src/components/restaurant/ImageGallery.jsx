import React, { useState } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function ImageGallery({ images, restaurantName }) {
    const [selectedIndex, setSelectedIndex] = useState(null);

    if (!images || images.length === 0) return null;

    const openGallery = (index) => {
        setSelectedIndex(index);
    };

    const closeGallery = () => {
        setSelectedIndex(null);
    };

    const goToPrevious = () => {
        setSelectedIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
    };

    const goToNext = () => {
        setSelectedIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    };

    return (
        <>
            <div className="grid grid-cols-4 gap-2 mt-4">
                {images.slice(0, 4).map((image, index) => (
                    <div
                        key={index}
                        className="relative aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => openGallery(index)}
                    >
                        <img
                            src={image}
                            alt={`${restaurantName} ${index + 1}`}
                            className="w-full h-full object-cover"
                        />
                        {index === 3 && images.length > 4 && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <span className="text-white font-semibold text-xl">
                                    +{images.length - 4}
                                </span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <Dialog open={selectedIndex !== null} onOpenChange={closeGallery}>
                <DialogContent className="max-w-4xl p-0 bg-black border-0">
                    <Button
                        onClick={closeGallery}
                        variant="ghost"
                        size="icon"
                        className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
                    >
                        <X className="h-6 w-6" />
                    </Button>

                    {selectedIndex !== null && (
                        <div className="relative">
                            <img
                                src={images[selectedIndex]}
                                alt={`${restaurantName} ${selectedIndex + 1}`}
                                className="w-full max-h-[80vh] object-contain"
                            />

                            {images.length > 1 && (
                                <>
                                    <Button
                                        onClick={goToPrevious}
                                        variant="ghost"
                                        size="icon"
                                        className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 rounded-full"
                                    >
                                        <ChevronLeft className="h-8 w-8" />
                                    </Button>
                                    <Button
                                        onClick={goToNext}
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 rounded-full"
                                    >
                                        <ChevronRight className="h-8 w-8" />
                                    </Button>

                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 px-3 py-1 rounded-full text-white text-sm">
                                        {selectedIndex + 1} / {images.length}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}