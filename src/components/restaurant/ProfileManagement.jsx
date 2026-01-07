import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Save, Upload, Plus, Trash2, Award, BookOpen, Share2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function ProfileManagement({ restaurantId }) {
    const queryClient = useQueryClient();
    const [uploadingGallery, setUploadingGallery] = useState(false);

    const { data: restaurant, isLoading } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
    });

    const [formData, setFormData] = useState({
        about_us: '',
        our_story: '',
        gallery_images: [],
        social_media: {
            facebook: '',
            instagram: '',
            twitter: '',
            tiktok: '',
            website: ''
        },
        awards_certifications: []
    });

    const [newAward, setNewAward] = useState({
        title: '',
        issuer: '',
        year: '',
        image_url: '',
        description: ''
    });

    React.useEffect(() => {
        if (restaurant) {
            setFormData({
                about_us: restaurant.about_us || '',
                our_story: restaurant.our_story || '',
                gallery_images: restaurant.gallery_images || [],
                social_media: restaurant.social_media || {
                    facebook: '',
                    instagram: '',
                    twitter: '',
                    tiktok: '',
                    website: ''
                },
                awards_certifications: restaurant.awards_certifications || []
            });
        }
    }, [restaurant]);

    const updateMutation = useMutation({
        mutationFn: (data) => base44.entities.Restaurant.update(restaurantId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant', restaurantId]);
            toast.success('Profile updated successfully');
        },
    });

    const handleGalleryUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setUploadingGallery(true);
        try {
            const uploadPromises = files.map(file => 
                base44.integrations.Core.UploadFile({ file })
            );
            const results = await Promise.all(uploadPromises);
            const newUrls = results.map(r => r.file_url);
            
            setFormData(prev => ({
                ...prev,
                gallery_images: [...prev.gallery_images, ...newUrls]
            }));
            toast.success(`${files.length} image(s) uploaded`);
        } catch (error) {
            toast.error('Failed to upload images');
        } finally {
            setUploadingGallery(false);
        }
    };

    const removeGalleryImage = (index) => {
        setFormData(prev => ({
            ...prev,
            gallery_images: prev.gallery_images.filter((_, i) => i !== index)
        }));
    };

    const addAward = () => {
        if (!newAward.title.trim()) {
            toast.error('Award title is required');
            return;
        }
        setFormData(prev => ({
            ...prev,
            awards_certifications: [...prev.awards_certifications, { ...newAward }]
        }));
        setNewAward({
            title: '',
            issuer: '',
            year: '',
            image_url: '',
            description: ''
        });
        toast.success('Award added');
    };

    const removeAward = (index) => {
        setFormData(prev => ({
            ...prev,
            awards_certifications: prev.awards_certifications.filter((_, i) => i !== index)
        }));
    };

    const handleSave = () => {
        updateMutation.mutate({
            about_us: formData.about_us,
            our_story: formData.our_story,
            gallery_images: formData.gallery_images,
            social_media: formData.social_media,
            awards_certifications: formData.awards_certifications
        });
    };

    if (isLoading) {
        return <div className="text-center py-8">Loading...</div>;
    }

    return (
        <div className="space-y-6">
            {/* About Us */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-orange-500" />
                        About Us
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Textarea
                        value={formData.about_us}
                        onChange={(e) => setFormData({ ...formData, about_us: e.target.value })}
                        placeholder="Tell customers about your restaurant - your cuisine, atmosphere, values..."
                        rows={5}
                        className="mb-3"
                    />
                    <p className="text-xs text-gray-500">
                        This will be displayed prominently on your restaurant page
                    </p>
                </CardContent>
            </Card>

            {/* Our Story */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-blue-500" />
                        Our Story
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Textarea
                        value={formData.our_story}
                        onChange={(e) => setFormData({ ...formData, our_story: e.target.value })}
                        placeholder="Share your restaurant's journey - how you started, what inspires you, family traditions..."
                        rows={6}
                        className="mb-3"
                    />
                    <p className="text-xs text-gray-500">
                        Connect with customers by sharing your unique story
                    </p>
                </CardContent>
            </Card>

            {/* Photo Gallery */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5 text-purple-500" />
                        Photo Gallery ({formData.gallery_images.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        {formData.gallery_images.map((url, index) => (
                            <div key={index} className="relative group">
                                <img
                                    src={url}
                                    alt={`Gallery ${index + 1}`}
                                    className="w-full h-32 object-cover rounded-lg"
                                />
                                <Button
                                    size="icon"
                                    variant="destructive"
                                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                                    onClick={() => removeGalleryImage(index)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                    <label>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            disabled={uploadingGallery}
                            asChild
                        >
                            <span>
                                {uploadingGallery ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
                                        Uploading...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="h-4 w-4 mr-2" />
                                        Upload Gallery Images
                                    </>
                                )}
                            </span>
                        </Button>
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={handleGalleryUpload}
                            disabled={uploadingGallery}
                        />
                    </label>
                    <p className="text-xs text-gray-500 mt-2">
                        Upload high-quality photos of your dishes, restaurant interior, and atmosphere
                    </p>
                </CardContent>
            </Card>

            {/* Social Media */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Share2 className="h-5 w-5 text-green-500" />
                        Social Media Links
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div>
                        <Label>Facebook</Label>
                        <Input
                            placeholder="https://facebook.com/yourrestaurant"
                            value={formData.social_media.facebook}
                            onChange={(e) => setFormData({
                                ...formData,
                                social_media: { ...formData.social_media, facebook: e.target.value }
                            })}
                        />
                    </div>
                    <div>
                        <Label>Instagram</Label>
                        <Input
                            placeholder="https://instagram.com/yourrestaurant"
                            value={formData.social_media.instagram}
                            onChange={(e) => setFormData({
                                ...formData,
                                social_media: { ...formData.social_media, instagram: e.target.value }
                            })}
                        />
                    </div>
                    <div>
                        <Label>Twitter/X</Label>
                        <Input
                            placeholder="https://twitter.com/yourrestaurant"
                            value={formData.social_media.twitter}
                            onChange={(e) => setFormData({
                                ...formData,
                                social_media: { ...formData.social_media, twitter: e.target.value }
                            })}
                        />
                    </div>
                    <div>
                        <Label>TikTok</Label>
                        <Input
                            placeholder="https://tiktok.com/@yourrestaurant"
                            value={formData.social_media.tiktok}
                            onChange={(e) => setFormData({
                                ...formData,
                                social_media: { ...formData.social_media, tiktok: e.target.value }
                            })}
                        />
                    </div>
                    <div>
                        <Label>Website</Label>
                        <Input
                            placeholder="https://yourrestaurant.com"
                            value={formData.social_media.website}
                            onChange={(e) => setFormData({
                                ...formData,
                                social_media: { ...formData.social_media, website: e.target.value }
                            })}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Awards & Certifications */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Award className="h-5 w-5 text-yellow-500" />
                        Awards & Certifications
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Existing Awards */}
                    {formData.awards_certifications.length > 0 && (
                        <div className="space-y-3 mb-6">
                            {formData.awards_certifications.map((award, index) => (
                                <div key={index} className="border rounded-lg p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-semibold">{award.title}</h4>
                                                {award.year && (
                                                    <Badge variant="outline">{award.year}</Badge>
                                                )}
                                            </div>
                                            {award.issuer && (
                                                <p className="text-sm text-gray-600">by {award.issuer}</p>
                                            )}
                                            {award.description && (
                                                <p className="text-sm text-gray-500 mt-1">{award.description}</p>
                                            )}
                                        </div>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => removeAward(index)}
                                        >
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add New Award */}
                    <div className="border-t pt-4 space-y-3">
                        <h4 className="font-semibold">Add New Award/Certification</h4>
                        <div>
                            <Label>Title *</Label>
                            <Input
                                placeholder="e.g., Best Italian Restaurant 2024"
                                value={newAward.title}
                                onChange={(e) => setNewAward({ ...newAward, title: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Issuer</Label>
                                <Input
                                    placeholder="e.g., Food Awards UK"
                                    value={newAward.issuer}
                                    onChange={(e) => setNewAward({ ...newAward, issuer: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>Year</Label>
                                <Input
                                    placeholder="e.g., 2024"
                                    value={newAward.year}
                                    onChange={(e) => setNewAward({ ...newAward, year: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <Label>Description</Label>
                            <Textarea
                                placeholder="Additional details about this award..."
                                value={newAward.description}
                                onChange={(e) => setNewAward({ ...newAward, description: e.target.value })}
                                rows={2}
                            />
                        </div>
                        <Button onClick={addAward} variant="outline" className="w-full">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Award
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Save Button */}
            <Button 
                onClick={handleSave} 
                className="w-full bg-orange-500 hover:bg-orange-600" 
                disabled={updateMutation.isPending}
            >
                <Save className="h-4 w-4 mr-2" />
                Save Profile Changes
            </Button>
        </div>
    );
}